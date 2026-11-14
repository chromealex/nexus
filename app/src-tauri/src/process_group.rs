//! Only groups created by this process are terminated. Used for cancellable test scripts.
pub struct Group(Option<u32>);
impl Group {
    pub fn new(child: &tokio::process::Child) -> Self {
        Self(child.id())
    }
}
impl Drop for Group {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.0 {
            unsafe extern "C" {
                fn kill(pid: i32, signal: i32) -> i32;
            }
            unsafe {
                kill(-(pid as i32), 9);
            }
        }
    }
}
