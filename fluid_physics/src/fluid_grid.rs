#![allow(dead_code, unused_variables)]

const DT: f32 = 0.016; //for 60 FPS

pub struct FluidGrid {
    //Size of grid
    nx: usize,
    ny: usize,
    nz: usize,
    active: Vec<bool>,

    dt: f32,

    //Updated values
    vecx: Vec<f32>,
    vecy: Vec<f32>,
    vecz: Vec<f32>,
    density: Vec<f32>,

    //Inital values
    vecx0: Vec<f32>,
    vecy0: Vec<f32>,
    vecz0: Vec<f32>,
    density0: Vec<f32>,
}

impl FluidGrid {
    pub fn new(nx: usize, ny: usize, nz: usize) -> FluidGrid {
        let size = nx * ny * nz;
        FluidGrid {
            nx,
            ny,
            nz,
            active: vec![true; size],
            dt: 0.0,
            vecx: vec![0.0; size],
            vecy: vec![0.0; size],
            vecz: vec![0.0; size],
            density: vec![0.0; size],
            vecx0: vec![0.0; size],
            vecy0: vec![0.0; size],
            vecz0: vec![0.0; size],
            density0: vec![0.0; size],
        }
    }

    pub fn nx(&self) -> usize {
        self.nx
    }

    pub fn ny(&self) -> usize {
        self.ny
    }

    pub fn nz(&self) -> usize {
        self.nz
    }

    pub fn get_dt(&self) -> f32 {
        self.dt
    }

    pub fn increment_dt(&mut self) {
        self.dt += DT;
    }
    pub fn idx(&self, x: usize, y: usize, z: usize) -> usize {
        return x + y * self.nx + z * self.nx * self.ny;
    }

    pub fn get_velocity(&self, x: usize, y: usize, z: usize) -> (f32, f32, f32) {
        let i = self.idx(x, y, z);
        (self.vecx[i], self.vecy[i], self.vecz[i])
    }

    pub fn get_density(&self, x: usize, y: usize, z: usize) -> f32 {
        let i = self.idx(x, y, z);
        self.density[i]
    }

    pub fn set_velocity(&mut self, x: usize, y: usize, z: usize, vx: f32, vy: f32, vz: f32) {
        let i = self.idx(x, y, z);
        self.vecx[i] = vx;
        self.vecy[i] = vy;
        self.vecz[i] = vz;
    }

    pub fn set_density(&mut self, x: usize, y: usize, z: usize, density: f32) {
        let i = self.idx(x, y, z);
        self.density[i] = density;
    }

    pub fn step(&mut self, dt: f32) {}

    pub fn advect(&mut self, dt: f32) {}

    pub fn project(&mut self) {}

    //Vector in the form [nx, ny, nz, x, y, z, density. x, y, z, density, ...]
    pub fn raw_3d_matrix(&self) -> Vec<f32> {
        let mut buf = Vec::new();

        //Return total matrix size
        buf.push(self.nx as f32);
        buf.push(self.ny as f32);
        buf.push(self.nz as f32);

        //Then return total information of the 3D matrix
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

    /*
     pub fn diffuse(&self) {

     }
    */
}
