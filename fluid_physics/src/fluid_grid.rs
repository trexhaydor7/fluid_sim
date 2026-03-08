// Staggered MAC (Marker-And-Cell) grid fluid simulation.
//
// Velocity components are stored on cell FACES, not centers:
//   vecx[i] = x-velocity on the LEFT face of cell i  (between cell x-1 and x)
//   vecy[i] = y-velocity on the BOTTOM face of cell i
//   vecz[i] = z-velocity on the FRONT face of cell i (between cell z-1 and z)
//
// This makes divergence exact: div(i) = vecx[x+1]-vecx[x] + vecy[y+1]-vecy[y] + vecz[z+1]-vecz[z]
// and pressure corrections only touch the two faces shared with each neighbor.

const GRAVITY: f32        = 4.5;   // strong pull ensures forward flow beats upward pressure
const ITERATIONS: usize   = 250;
const OVERRELAX: f32      = 1.95;
const DENSITY_DECAY: f32  = 0.99997;  // slower decay → fluid holds together longer
const DENSITY_DIFFUSE: f32 = 0.18;    // spatial smoothing to fill gaps between cells

pub struct FluidGrid {
    nx: usize,
    ny: usize,
    nz: usize,

    // active[i] = false means solid wall — velocity is zero, density is zero
    active: Vec<bool>,

    // Face-centred velocities (MAC grid)
    // vecx[idx(x,y,z)] = velocity entering cell (x,y,z) from the left  (+x direction)
    // vecy[idx(x,y,z)] = velocity entering cell (x,y,z) from below     (+y direction)
    // vecz[idx(x,y,z)] = velocity entering cell (x,y,z) from the front (+z direction)
    vecx: Vec<f32>,
    vecy: Vec<f32>,
    vecz: Vec<f32>,
    density: Vec<f32>,

    // Scratch buffers for advection
    vecx0: Vec<f32>,
    vecy0: Vec<f32>,
    vecz0: Vec<f32>,
    density0: Vec<f32>,

    dt_acc: f32,
    // Inlet source cells: applied after advect so advection cannot erase them
    inlets: Vec<(usize, f32, f32, f32)>,
}

impl FluidGrid {
    pub fn new(nx: usize, ny: usize, nz: usize) -> FluidGrid {
        let size = nx * ny * nz;
        FluidGrid {
            nx, ny, nz,
            active:   vec![true; size],
            vecx:     vec![0.0; size],
            vecy:     vec![0.0; size],
            vecz:     vec![0.0; size],
            density:  vec![0.0; size],
            vecx0:    vec![0.0; size],
            vecy0:    vec![0.0; size],
            vecz0:    vec![0.0; size],
            density0: vec![0.0; size],
            dt_acc:   0.0,
            inlets:   Vec::new(),
        }
    }

    pub fn nx(&self) -> usize { self.nx }
    pub fn ny(&self) -> usize { self.ny }
    pub fn nz(&self) -> usize { self.nz }
    pub fn get_dt(&self) -> f32 { self.dt_acc }
    pub fn increment_dt(&mut self) { self.dt_acc += 0.016; }

    #[inline]
    pub fn idx(&self, x: usize, y: usize, z: usize) -> usize {
        x + y * self.nx + z * self.nx * self.ny
    }

    pub fn get_velocity(&self, x: usize, y: usize, z: usize) -> (f32, f32, f32) {
        let i = self.idx(x, y, z);
        (self.vecx[i], self.vecy[i], self.vecz[i])
    }

    pub fn get_density(&self, x: usize, y: usize, z: usize) -> f32 {
        self.density[self.idx(x, y, z)]
    }

    pub fn set_velocity(&mut self, x: usize, y: usize, z: usize, vx: f32, vy: f32, vz: f32) {
        let i = self.idx(x, y, z);
        if self.active[i] {
            self.vecx[i] = vx;
            self.vecy[i] = vy;
            self.vecz[i] = vz;
        }
    }

    pub fn set_density(&mut self, x: usize, y: usize, z: usize, d: f32) {
        let i = self.idx(x, y, z);
        if self.active[i] { self.density[i] = d; }
    }

    // Register a cell as a permanent fluid inlet.
    // Every step after advection, this cell gets density=1 and the given velocity.
    pub fn add_inlet(&mut self, x: usize, y: usize, z: usize, vx: f32, vy: f32, vz: f32) {
        let i = self.idx(x, y, z);
        if self.active[i] {
            self.inlets.push((i, vx, vy, vz));
        }
    }

    pub fn clear_inlets(&mut self) {
        self.inlets.clear();
    }

    pub fn set_active(&mut self, x: usize, y: usize, z: usize, active: bool) {
        let i = self.idx(x, y, z);
        self.active[i] = active;
        if !active {
            self.vecx[i] = 0.0; self.vecy[i] = 0.0; self.vecz[i] = 0.0;
            self.density[i]  = 0.0;
            self.vecx0[i] = 0.0; self.vecy0[i] = 0.0; self.vecz0[i] = 0.0;
            self.density0[i] = 0.0;
        }
    }

    // ── Main timestep ────────────────────────────────────────────────────────
    pub fn step(&mut self, dt: f32) {
        self.dt_acc += dt;
        self.integrate(dt);
        self.apply_inlets();   // set inlet velocity BEFORE project, so the
                               // pressure solver routes flow around buildings
                               // rather than cancelling the inlet momentum
        self.project();
        self.extrapolate();
        self.open_boundary();
        self.advect(dt);
        self.apply_inlets();   // re-apply after advect so backtracing can't erase them
        self.diffuse_density(); // smooth out gaps before rendering
        self.enforce_walls();
        self.sanitize();
    }

    // ── Gravity + horizontal momentum preservation ───────────────────────────
    fn integrate(&mut self, dt: f32) {
        for z in 0..self.nz {
            for y in 0..self.ny {
                for x in 0..self.nx {
                    let i = self.idx(x, y, z);
                    if self.active[i] {
                        self.vecy[i] -= GRAVITY * dt;
                        // Gentle horizontal viscosity: nudge x/z velocities toward
                        // their neighbors so pressure can spread laterally.
                        // This mimics incompressible fluid spreading sideways when blocked.
                        // Aggressively damp upward velocity — water should not climb walls.
                        // Two-tier damping: any positive vy is cut hard each frame,
                        // and anything below a small threshold is zeroed outright.
                        if self.vecy[i] > 0.0 {
                            self.vecy[i] *= 0.05;      // crush upward momentum almost instantly
                            if self.vecy[i] < 0.05 {
                                self.vecy[i] = 0.0;
                            }
                        }

                        if x > 0 && x < self.nx - 1 {
                            let left  = self.idx(x-1, y, z);
                            let right = self.idx(x+1, y, z);
                            if self.active[left] && self.active[right] {
                                let avg = (self.vecx[left] + self.vecx[i] + self.vecx[right]) / 3.0;
                                self.vecx[i] += (avg - self.vecx[i]) * 0.12;
                            }
                        }
                        // Strong z-spreading: when fluid is blocked in x it should
                        // fan out along z (around buildings) rather than pile up and rise.
                        if z > 0 && z < self.nz - 1 {
                            let front = self.idx(x, y, z-1);
                            let back  = self.idx(x, y, z+1);
                            if self.active[front] && self.active[back] {
                                let avg = (self.vecz[front] + self.vecz[i] + self.vecz[back]) / 3.0;
                                self.vecz[i] += (avg - self.vecz[i]) * 0.35;
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Pressure projection (MAC grid) ───────────────────────────────────────
    // Alternates forward and backward sweeps each iteration so pressure
    // propagates equally in all directions — critical for maze-like geometry
    // where a single-direction sweep biases flow toward the sweep direction.
    fn project(&mut self) {
        let nx = self.nx; let ny = self.ny; let nz = self.nz;

        for iter in 0..ITERATIONS {
            let fwd = iter % 2 == 0;

            // Iterate in alternating directions each sweep
            let x_range: Box<dyn Iterator<Item=usize>> = if fwd {
                Box::new(1..nx-1)
            } else {
                Box::new((1..nx-1).rev())
            };

            for x in x_range {
                let y_range: Box<dyn Iterator<Item=usize>> = if fwd {
                    Box::new(1..ny-1)
                } else {
                    Box::new((1..ny-1).rev())
                };
                for y in y_range {
                    let z_range: Box<dyn Iterator<Item=usize>> = if fwd {
                        Box::new(1..nz-1)
                    } else {
                        Box::new((1..nz-1).rev())
                    };
                    for z in z_range {
                        let i = self.idx(x, y, z);
                        if !self.active[i] { continue; }

                        let sx0 = self.active[self.idx(x-1, y, z)] as u8 as f32;
                        let sx1 = self.active[self.idx(x+1, y, z)] as u8 as f32;
                        let sy0 = self.active[self.idx(x, y-1, z)] as u8 as f32;
                        let sy1 = self.active[self.idx(x, y+1, z)] as u8 as f32;
                        let sz0 = self.active[self.idx(x, y, z-1)] as u8 as f32;
                        let sz1 = self.active[self.idx(x, y, z+1)] as u8 as f32;
                        let s = sx0 + sx1 + sy0 + sy1 + sz0 + sz1;
                        if s < 0.5 { continue; }

                        let i_xp1 = self.idx(x+1, y,   z  );
                        let i_yp1 = self.idx(x,   y+1, z  );
                        let i_zp1 = self.idx(x,   y,   z+1);

                        let div = (sx1 * self.vecx[i_xp1] - sx0 * self.vecx[i])
                                + (sy1 * self.vecy[i_yp1] - sy0 * self.vecy[i])
                                + (sz1 * self.vecz[i_zp1] - sz0 * self.vecz[i]);

                        let p = -div / s * OVERRELAX;

                        self.vecx[i]     -= sx0 * p;
                        self.vecx[i_xp1] += sx1 * p;
                        self.vecy[i]     -= sy0 * p;
                        self.vecy[i_yp1] += sy1 * p;
                        self.vecz[i]     -= sz0 * p;
                        self.vecz[i_zp1] += sz1 * p;
                    }
                }
            }
        }
    }

    // ── Boundary extrapolation ────────────────────────────────────────────────
    // Copy interior velocities into the 1-cell-thick border ghost layer so that
    // advection backtracing doesn't get wrong values at the edges.
    fn extrapolate(&mut self) {
        let nx = self.nx; let ny = self.ny; let nz = self.nz;

        for z in 0..nz {
            for x in 0..nx {
                let src1 = self.idx(x, 1,    z); let dst1 = self.idx(x, 0,    z);
                let src2 = self.idx(x, ny-2, z); let dst2 = self.idx(x, ny-1, z);
                self.vecy[dst1] = self.vecy[src1];
                self.vecy[dst2] = self.vecy[src2];
            }
        }
        for z in 0..nz {
            for y in 0..ny {
                let src1 = self.idx(1,    y, z); let dst1 = self.idx(0,    y, z);
                let src2 = self.idx(nx-2, y, z); let dst2 = self.idx(nx-1, y, z);
                self.vecx[dst1] = self.vecx[src1];
                self.vecx[dst2] = self.vecx[src2];
            }
        }
        for y in 0..ny {
            for x in 0..nx {
                let src1 = self.idx(x, y, 1   ); let dst1 = self.idx(x, y, 0   );
                let src2 = self.idx(x, y, nz-2); let dst2 = self.idx(x, y, nz-1);
                self.vecz[dst1] = self.vecz[src1];
                self.vecz[dst2] = self.vecz[src2];
            }
        }
    }

    // ── Semi-Lagrangian advection ─────────────────────────────────────────────
    // For each active cell, trace a particle backward through the velocity field
    // and sample the old values at that position (trilinear interpolation).
    // Velocity at cell center = average of the two face velocities on each axis.
    fn advect(&mut self, dt: f32) {
        self.vecx0    = self.vecx.clone();
        self.vecy0    = self.vecy.clone();
        self.vecz0    = self.vecz.clone();
        self.density0 = self.density.clone();

        let nx = self.nx as f32;
        let ny = self.ny as f32;
        let nz = self.nz as f32;
        let inx = self.nx;
        let iny = self.ny;
        let inz = self.nz;

        for z in 1..inz - 1 {
            for y in 1..iny - 1 {
                for x in 1..inx - 1 {
                    let i = self.idx(x, y, z);
                    if !self.active[i] { continue; }

                    // Cell-center velocity = average of face pair
                    let ip1 = self.idx(x+1, y, z);
                    let jp1 = self.idx(x, y+1, z);
                    let kp1 = self.idx(x, y, z+1);

                    let vx = (self.vecx0[i] + self.vecx0[ip1]) * 0.5;
                    let vy = (self.vecy0[i] + self.vecy0[jp1]) * 0.5;
                    let vz = (self.vecz0[i] + self.vecz0[kp1]) * 0.5;

                    // Backtrace
                    let src_x = (x as f32 - vx * dt).clamp(0.5, nx - 1.5);
                    let src_y = (y as f32 - vy * dt).clamp(0.5, ny - 1.5);
                    let src_z = (z as f32 - vz * dt).clamp(0.5, nz - 1.5);

                    let x0 = src_x as usize; let x1 = (x0+1).min(inx-1);
                    let y0 = src_y as usize; let y1 = (y0+1).min(iny-1);
                    let z0 = src_z as usize; let z1 = (z0+1).min(inz-1);
                    let tx = src_x - x0 as f32;
                    let ty = src_y - y0 as f32;
                    let tz = src_z - z0 as f32;

                    // Helper: trilinear sample of a field.
                    // For inactive (solid) corner cells we substitute the value
                    // of the nearest active corner so that density doesn't
                    // artificially collapse to zero against a wall face.
                    macro_rules! trilin {
                        ($buf:expr) => {{
                            // Gather the 8 corner values, flagging which are active
                            let corners: [(f32, bool); 8] = [
                                { let ii = x0+y0*inx+z0*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x1+y0*inx+z0*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x0+y1*inx+z0*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x1+y1*inx+z0*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x0+y0*inx+z1*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x1+y0*inx+z1*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x0+y1*inx+z1*inx*iny; ($buf[ii], self.active[ii]) },
                                { let ii = x1+y1*inx+z1*inx*iny; ($buf[ii], self.active[ii]) },
                            ];
                            // Fallback value: average of active corners
                            let active_sum: f32 = corners.iter().filter(|c| c.1).map(|c| c.0).sum();
                            let active_cnt: usize = corners.iter().filter(|c| c.1).count();
                            let fallback = if active_cnt > 0 { active_sum / active_cnt as f32 } else { 0.0 };
                            let v = |idx: usize| -> f32 { if corners[idx].1 { corners[idx].0 } else { fallback } };
                            // Standard trilinear interpolation using filled values
                            (1.0-tz)*((1.0-ty)*((1.0-tx)*v(0)+tx*v(1))
                                          +ty *((1.0-tx)*v(2)+tx*v(3)))
                               +tz *((1.0-ty)*((1.0-tx)*v(4)+tx*v(5))
                                          +ty *((1.0-tx)*v(6)+tx*v(7)))
                        }};
                    }

                    self.density[i] = trilin!(self.density0);
                    self.vecx[i]    = trilin!(self.vecx0);
                    self.vecy[i]    = trilin!(self.vecy0);
                    self.vecz[i]    = trilin!(self.vecz0);
                }
            }
        }
    }

    // ── Apply inlet sources ──────────────────────────────────────────────────
    // Called both before project (so pressure routes flow around buildings)
    // and after advect (so backtracing can't erase them).
    fn apply_inlets(&mut self) {
        for &(i, vx, vy, vz) in &self.inlets {
            self.density[i] = 1.0;
            self.vecx[i]    = vx;
            self.vecy[i]    = vy;
            self.vecz[i]    = vz;
            // Seed the next cell in +x too so the pressure gradient has
            // something to push against and doesn't immediately cancel inlet vx.
            // i+1 is x+1 only when valid — check bounds via nx stride.
            let i_xp1 = i + 1;
            if i_xp1 < self.active.len() && self.active[i_xp1] {
                self.vecx[i_xp1] = vx;
                self.density[i_xp1] = 1.0;
            }
        }
    }

    // ── Open outflow boundary on right (x = nx-1), top (y = ny-1), and Z faces ──
    // Copies velocity from the interior so fluid can exit without pressure buildup.
    fn open_boundary(&mut self) {
        let nx = self.nx; let ny = self.ny; let nz = self.nz;
        // Right face — fluid exits in +x direction
        for z in 0..nz {
            for y in 0..ny {
                let src = self.idx(nx-2, y, z);
                let dst = self.idx(nx-1, y, z);
                if self.active[src] {
                    self.vecx[dst]    = self.vecx[src].max(0.0); // only allow outflow
                    self.density[dst] = 0.0;                      // drain density at edge
                }
            }
        }
        // Top face — fluid exits upward
        for z in 0..nz {
            for x in 0..nx {
                let src = self.idx(x, ny-2, z);
                let dst = self.idx(x, ny-1, z);
                if self.active[src] {
                    self.vecy[dst]    = self.vecy[src].max(0.0);
                    self.density[dst] = 0.0;
                }
            }
        }
        // Front/back Z faces — prevent pressure from reflecting off Z walls
        for y in 0..ny {
            for x in 0..nx {
                let src0 = self.idx(x, y, 1);
                let dst0 = self.idx(x, y, 0);
                if self.active[src0] {
                    self.vecz[dst0]    = self.vecz[src0].min(0.0); // only inward exit
                    self.density[dst0] = 0.0;
                }
                let src1 = self.idx(x, y, nz-2);
                let dst1 = self.idx(x, y, nz-1);
                if self.active[src1] {
                    self.vecz[dst1]    = self.vecz[src1].max(0.0);
                    self.density[dst1] = 0.0;
                }
            }
        }
    }

    // ── Zero solid cells, but preserve shared faces with fluid neighbors ────────
    // In a MAC grid, vecx[idx(x,y,z)] is the LEFT face of cell (x,y,z).
    // That same face is the RIGHT face of cell (x-1,y,z).
    // If (x,y,z) is solid but (x-1,y,z) is fluid, zeroing vecx[i] kills
    // valid outflow velocity from the fluid side.  We must NOT zero shared faces.
    fn enforce_walls(&mut self) {
        let nx = self.nx; let ny = self.ny; let nz = self.nz;
        for z in 0..nz {
            for y in 0..ny {
                for x in 0..nx {
                    let i = self.idx(x, y, z);
                    if self.active[i] { continue; }
                    self.density[i] = 0.0;

                    // Only zero vecx[i] (left face of this solid cell) if the
                    // cell to the left is ALSO solid (or out of bounds).
                    let left_fluid = x > 0 && self.active[self.idx(x-1, y, z)];
                    if !left_fluid { self.vecx[i] = 0.0; }

                    let below_fluid = y > 0 && self.active[self.idx(x, y-1, z)];
                    if !below_fluid { self.vecy[i] = 0.0; }

                    let front_fluid = z > 0 && self.active[self.idx(x, y, z-1)];
                    if !front_fluid { self.vecz[i] = 0.0; }
                }
            }
        }
    }

    // ── NaN / clamp guard ────────────────────────────────────────────────────
    fn sanitize(&mut self) {
        for i in 0..self.density.len() {
            if self.vecx[i].is_nan()    { self.vecx[i]    = 0.0; }
            if self.vecy[i].is_nan()    { self.vecy[i]    = 0.0; }
            if self.vecz[i].is_nan()    { self.vecz[i]    = 0.0; }
            if self.density[i].is_nan() { self.density[i] = 0.0; }
            self.vecx[i]    = self.vecx[i].clamp(-60.0, 60.0);
            self.vecy[i]    = self.vecy[i].clamp(-8.0, 0.15);  // hard asymmetric cap: falls freely, barely rises
            self.vecz[i]    = self.vecz[i].clamp(-60.0, 60.0);
            self.density[i] = (self.density[i] * DENSITY_DECAY).clamp(0.0, 1.0);
        }
    }

    // ── Density diffusion ────────────────────────────────────────────────────
    // One pass of spatial averaging: each active cell takes a weighted blend
    // of itself and its active face-neighbours.  Upward neighbour is excluded
    // so density cannot bleed above the waterline and make fluid appear to
    // climb walls.
    fn diffuse_density(&mut self) {
        let nx = self.nx; let ny = self.ny; let nz = self.nz;
        let old = self.density.clone();
        for z in 1..nz-1 {
            for y in 1..ny-1 {
                for x in 1..nx-1 {
                    let i = self.idx(x, y, z);
                    if !self.active[i] { continue; }

                    // Lateral (x/z) and downward (y-1) neighbours only —
                    // never the cell above (y+1) to prevent upward creep.
                    let neighbours = [
                        self.idx(x-1, y,   z),
                        self.idx(x+1, y,   z),
                        self.idx(x,   y-1, z),   // below only, not above
                        self.idx(x,   y,   z-1),
                        self.idx(x,   y,   z+1),
                    ];
                    let mut sum = 0.0f32;
                    let mut cnt = 0usize;
                    for &ni in &neighbours {
                        if self.active[ni] {
                            sum += old[ni];
                            cnt += 1;
                        }
                    }
                    if cnt > 0 {
                        let avg = sum / cnt as f32;
                        self.density[i] = old[i] * (1.0 - DENSITY_DIFFUSE) + avg * DENSITY_DIFFUSE;
                    }
                }
            }
        }
    }

    // ── Output ───────────────────────────────────────────────────────────────
    pub fn raw_3d_matrix(&self) -> Vec<f32> {
        let mut buf = Vec::with_capacity(3 + self.nx * self.ny * self.nz * 4);
        buf.push(self.nx as f32);
        buf.push(self.ny as f32);
        buf.push(self.nz as f32);
        for z in 0..self.nz {
            for y in 0..self.ny {
                for x in 0..self.nx {
                    let i = self.idx(x, y, z);
                    buf.push(x as f32);
                    buf.push(y as f32);
                    buf.push(z as f32);
                    buf.push(self.density[i]);
                }
            }
        }
        buf
    }
}