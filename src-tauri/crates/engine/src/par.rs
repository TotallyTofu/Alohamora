//! Small parallel helper (replaces `mapLimit`).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// Run `f` over `items` with at most `limit` threads. Keeps the input order.
pub fn map_limit<T: Sync, R: Send>(items: &[T], limit: usize, f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let next = AtomicUsize::new(0);
    let results: Vec<Mutex<Option<R>>> = items.iter().map(|_| Mutex::new(None)).collect();
    std::thread::scope(|s| {
        for _ in 0..limit.max(1).min(items.len().max(1)) {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::SeqCst);
                if i >= items.len() {
                    break;
                }
                let r = f(&items[i]);
                *results[i].lock().expect("result slot") = Some(r);
            });
        }
    });
    results.into_iter().map(|m| m.into_inner().expect("result slot").expect("every item ran")).collect()
}
