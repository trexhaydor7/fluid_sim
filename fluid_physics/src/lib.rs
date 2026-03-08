use wasm_bindgen::prelude::*;

mod fluid_grid;
use fluid_grid::FluidGrid;

#[wasm_bindgen]
pub struct FluidSim {
    grid: FluidGrid,
}

#[wasm_bindgen]
impl FluidSim {
    #[wasm_bindgen(constructor)]
    pub fn new(nx: usize, ny: usize, nz: usize) -> FluidSim {
        FluidSim {
            grid: FluidGrid::new(nx, ny, nz),
        }
    }

    pub fn get_dt(&self) -> f32 {
        return self.grid.get_dt();
    }

    pub fn increment_dt(&mut self) -> f32 {
        self.grid.increment_dt();
        self.grid.get_dt()
    }

    pub fn raw_3d_matrix(&self) -> Box<[f32]> {
        self.grid.raw_3d_matrix().into()
    }

    pub fn set_density(&mut self, x: usize, y: usize, z: usize, density: f32) {
        self.grid.set_density(x, y, z, density);
    }
}
