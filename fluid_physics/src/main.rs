use wasm_bindgen::prelude::*;

mod fluid_grid;
use fluid_grid::FluidGrid;

#[wasm_bindgen]
pub fn main() {
    println!("Running fluid grid tests...\n");

    test_grid_creation();
    test_index_mapping();
    test_set_and_get_density();
    test_set_and_get_velocity();
    test_bounds();

    println!("\nAll tests passed.");
}

fn test_grid_creation() {
    let grid = FluidGrid::new(4, 4, 4);

    // Access size via getters, not fields directly
    assert_eq!(grid.nx(), 4);
    assert_eq!(grid.ny(), 4);
    assert_eq!(grid.nz(), 4);

    // Check all cells start at zero via getters
    for z in 0..4 {
        for y in 0..4 {
            for x in 0..4 {
                assert_eq!(grid.get_density(x, y, z), 0.0);
                let (vx, vy, vz): (f32, f32, f32) = grid.get_velocity(x, y, z);
                assert_eq!(vx, 0.0);
                assert_eq!(vy, 0.0);
                assert_eq!(vz, 0.0);
            }
        }
    }

    println!("[PASS] grid creation — size 4x4x4, all zeros");
}

fn test_index_mapping() {
    let grid = FluidGrid::new(4, 4, 4);

    assert_eq!(grid.idx(0, 0, 0), 0);
    assert_eq!(grid.idx(1, 0, 0), 1); // +1 along x
    assert_eq!(grid.idx(0, 1, 0), 4); // +nx along y
    assert_eq!(grid.idx(0, 0, 1), 16); // +nx*ny along z
    assert_eq!(grid.idx(2, 3, 1), 30); // 2 + 3*4 + 1*16

    println!("[PASS] index mapping — idx(x,y,z) = x + y*nx + z*nx*ny");
}

fn test_set_and_get_density() {
    let mut grid = FluidGrid::new(8, 8, 8);

    grid.set_density(4, 4, 4, 1.0);
    assert_eq!(grid.get_density(4, 4, 4), 1.0);

    // Neighbours unaffected
    assert_eq!(grid.get_density(3, 4, 4), 0.0);
    assert_eq!(grid.get_density(4, 3, 4), 0.0);

    // Overwrite
    grid.set_density(4, 4, 4, 0.25);
    assert_eq!(grid.get_density(4, 4, 4), 0.25);

    println!("[PASS] density — set/get, overwrite, isolation");
}

fn test_set_and_get_velocity() {
    let mut grid = FluidGrid::new(8, 8, 8);

    grid.set_velocity(4, 4, 4, 1.5, -0.5, 0.3);
    let (vx, vy, vz): (f32, f32, f32) = grid.get_velocity(4, 4, 4);
    assert_eq!(vx, 1.5);
    assert_eq!(vy, -0.5);
    assert_eq!(vz, 0.3);

    // Neighbour unaffected
    let (nx, ny, nz): (f32, f32, f32) = grid.get_velocity(5, 4, 4);
    assert_eq!(nx, 0.0);
    assert_eq!(ny, 0.0);
    assert_eq!(nz, 0.0);

    // Fractional values
    grid.set_velocity(1, 1, 1, 0.001, 0.002, 0.003);
    let (vx, vy, vz): (f32, f32, f32) = grid.get_velocity(1, 1, 1);
    assert!((vx - 0.001).abs() < 1e-6);
    assert!((vy - 0.002).abs() < 1e-6);
    assert!((vz - 0.003).abs() < 1e-6);

    println!("[PASS] velocity — set/get, fractional values, neighbour isolation");
}

fn test_bounds() {
    let grid = FluidGrid::new(4, 6, 8);

    // Last valid cell should be (nx-1, ny-1, nz-1)
    let last = grid.idx(3, 5, 7);
    let total = grid.nx() * grid.ny() * grid.nz();
    assert_eq!(last, total - 1);
    assert_eq!(total, 4 * 6 * 8);

    println!("[PASS] bounds — non-cubic grid (4x6x8), last index correct");
}
