//! Port of src/main/jobs/*: one job = one JobRequest run by converters or tool runners.

pub mod context;
pub mod execute;
pub mod queue;

pub use context::{JobContext, OutputSpec};
