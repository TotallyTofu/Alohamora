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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn keeps_the_input_order_and_the_limit() {
        let active = AtomicUsize::new(0);
        let peak = AtomicUsize::new(0);
        let items: Vec<u64> = (0..12).collect();
        let out = map_limit(&items, 3, |x| {
            let now = active.fetch_add(1, Ordering::SeqCst) + 1;
            peak.fetch_max(now, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(12 - x)); // later items finish first
            active.fetch_sub(1, Ordering::SeqCst);
            x * 10
        });
        assert_eq!(out, items.iter().map(|x| x * 10).collect::<Vec<_>>());
        assert!(peak.load(Ordering::SeqCst) <= 3);
    }

    #[test]
    fn edge_cases() {
        assert_eq!(map_limit(&[1, 2], 0, |x| x + 1), vec![2, 3]);
        assert!(map_limit(&[] as &[u8], 4, |x| *x).is_empty());
    }
}
