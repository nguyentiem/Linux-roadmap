# Lộ trình học Linux: Từ Zero đến Senior (dành cho kỹ sư có nền tảng C / Embedded)

> Giả định: đã biết lập trình C, chưa biết gì về Linux. Lộ trình thiên về hướng **system programming + embedded Linux**, vì phù hợp với nền tảng STM32/FreeRTOS/nRF52840 đang có, nhưng vẫn đủ tổng quát để dùng cho backend/DevOps nếu cần rẽ hướng.

---

## Cấp độ 0 — Làm quen (Beginner)

### 0.1. Cài đặt & môi trường
- Cài Linux thật (dual boot hoặc VM: Ubuntu/Debian) — **không dùng WSL làm môi trường chính** nếu mục tiêu là hiểu Linux thật sự.
- Phân biệt distro (Debian-based, RHEL-based, Arch) và package manager tương ứng (apt, dnf/yum, pacman).
- Hiểu khái niệm kernel vs userspace vs distro.

### 0.2. Shell cơ bản
- Điều hướng filesystem: `pwd`, `cd`, `ls`, `find`, `locate`.
- Thao tác file: `cp`, `mv`, `rm`, `mkdir`, `touch`, `cat`, `less`, `head`/`tail`.
- Redirection & pipe: `>`, `>>`, `<`, `|`, `2>&1`.
- Biến môi trường: `export`, `.bashrc`, `.bash_profile`, `PATH`.

**Đặc điểm cần nắm:** hiểu **mọi thứ trong Linux là file** (device, socket, pipe cũng là file); phân biệt shell interactive vs script; hiểu exit code (`$?`).

### 0.3. Filesystem Hierarchy Standard (FHS)
- Ý nghĩa của `/etc`, `/bin`, `/usr`, `/var`, `/home`, `/dev`, `/proc`, `/sys`, `/tmp`, `/opt`.
- Symbolic link vs hard link (`ln`, `ln -s`).

**Đặc điểm cần nắm:** `/proc` và `/sys` là virtual filesystem phản ánh trạng thái kernel — nền tảng để sau này debug hệ thống mà không cần công cụ ngoài.

### 0.4. Permission & User cơ bản
- `chmod`, `chown`, `chgrp`; ý nghĩa rwx, octal notation.
- User/group cơ bản: `whoami`, `id`, `sudo`.

**Đặc điểm cần nắm:** hiểu rõ 3 bộ quyền (owner/group/other) và setuid/setgid/sticky bit — quan trọng khi sau này làm bootloader/OTA cần ký quyền file.

---

## Cấp độ 1 — Sử dụng thành thạo (Junior → Mid)

### 1.1. Text processing & scripting
- `grep`, `sed`, `awk`, `cut`, `sort`, `uniq`, `xargs`, regex cơ bản.
- Viết Bash script: biến, điều kiện, vòng lặp, hàm, `$1..$n`, `set -e`.

**Đặc điểm cần nắm:** viết được script tự động hóa build/flash firmware, log-parsing script — kỹ năng dùng hàng ngày cho embedded dev.

### 1.2. Quản lý tiến trình
- `ps`, `top`/`htop`, `kill`, `killall`, `nice`/`renice`.
- Foreground/background: `&`, `jobs`, `fg`, `bg`, `nohup`, `disown`.
- Signal: SIGTERM, SIGKILL, SIGHUP, SIGINT — cách xử lý trong C (`signal()`, `sigaction()`).

**Đặc điểm cần nắm:** hiểu process state (R/S/D/Z/T), phân biệt process vs thread ở mức OS.

### 1.3. Quản lý gói & biên dịch
- apt/dnf cơ bản, biên dịch từ source: `./configure && make && make install`.
- Toolchain: `gcc`, `binutils`, `make`, giới thiệu `cmake`.

**Đặc điểm cần nắm:** hiểu các bước compile → assemble → link, phân biệt static vs dynamic linking (`.a` vs `.so`), dùng `ldd` để xem dependency.

### 1.4. Networking cơ bản
- `ip a`, `ping`, `curl`/`wget`, `ss`/`netstat`, `/etc/hosts`, `/etc/resolv.conf`.
- SSH: keypair, `scp`, `rsync`, port forwarding cơ bản.

**Đặc điểm cần nắm:** tự setup SSH key-based login, hiểu sự khác biệt TCP vs UDP ở mức thực hành.

### 1.5. Editor & version control
- Vim ở mức dùng được (insert/normal mode, tìm-thay, buffer).
- Git cơ bản: clone/commit/branch/merge/rebase.

---

## Cấp độ 2 — Vận hành hệ thống (Mid → Senior-track)

### 2.1. systemd & init
- Viết unit file (`.service`), `systemctl start/enable/status`, `journalctl`.
- Hiểu boot sequence: bootloader → kernel → initramfs → init (systemd) → target.

**Đặc điểm cần nắm:** đây là kiến thức bản lề để chuyển sang embedded Linux — cùng khái niệm (bootloader → kernel → rootfs) áp dụng cho Yocto/Buildroot.

### 2.2. Storage & filesystem nâng cao
- Partition (`fdisk`/`parted`), filesystem (ext4, btrfs, tmpfs), mount/umount, `/etc/fstab`.
- LVM cơ bản, RAID khái niệm.
- Journaling filesystem, power-loss safety — liên hệ trực tiếp đến thiết kế OTA/dual-bank đã làm với STM32.

### 2.3. Logging & cron
- `journalctl`, `rsyslog`, log rotation (`logrotate`).
- `cron`, `systemd timer`.

### 2.4. Bash nâng cao & automation
- Xử lý lỗi robust trong script, trap, subshell.
- CI script cho build firmware/test tự động (liên hệ Jenkins/GitLab CI).

### 2.5. Networking nâng cao
- iptables/nftables cơ bản, firewall.
- DNS, DHCP, VPN khái niệm.
- Debug: `tcpdump`, `wireshark` cơ bản.

**Đặc điểm cần nắm:** đọc được packet capture để debug giao tiếp BLE-gateway/cellular modem qua IP.

---

## Cấp độ 3 — Lập trình hệ thống trên Linux (Senior-track)

> Đây là phần **quan trọng nhất** với nền tảng C sẵn có — chuyển từ "dùng Linux" sang "lập trình cho Linux".

### 3.1. POSIX & System call
- Syscall là gì, cách gọi qua glibc wrapper (`open`, `read`, `write`, `close`, `ioctl`).
- `strace` để trace syscall — công cụ debug số 1.
- Error handling qua `errno`.

### 3.2. Process & Thread
- `fork()`, `exec()`, `wait()`/`waitpid()`, zombie/orphan process.
- POSIX Thread (`pthread`): tạo thread, mutex, condition variable, `pthread_join`.
- So sánh với FreeRTOS task/semaphore đã quen — điểm giống/khác về scheduling.

### 3.3. IPC (Inter-Process Communication)
- Pipe, named pipe (FIFO), message queue, shared memory (`shm_open`/`mmap`), semaphore.
- Unix domain socket vs TCP socket.

**Đặc điểm cần nắm:** biết chọn đúng cơ chế IPC theo bài toán (throughput vs latency vs độ phức tạp).

### 3.4. Memory management
- Virtual memory, paging, `mmap()`, heap vs stack trên Linux.
- Memory leak/corruption debug: `valgrind`, `gdb`, AddressSanitizer.

### 3.5. Socket programming
- BSD socket API: TCP server/client, UDP, non-blocking I/O.
- I/O multiplexing: `select`, `poll`, `epoll` (quan trọng cho hệ thống hiệu năng cao).

### 3.6. Build system nâng cao
- Makefile nâng cao, CMake cho project đa nền tảng.
- Cross-compilation toolchain — cầu nối trực tiếp sang embedded Linux.

---

## Cấp độ 4 — Embedded Linux & Kernel (Senior)

> Phần này ứng dụng trực tiếp kinh nghiệm STM32/bootloader/OTA đang có vào Linux-based embedded system.

### 4.1. Kiến trúc Embedded Linux
- Bootloader (U-Boot) → Kernel → Device Tree → Root filesystem.
- So sánh với secure bootloader TrustZone đã làm trên STM32H523 — khái niệm chain-of-trust tương tự (Secure Boot, dm-verity).

### 4.2. Buildroot / Yocto Project
- Cách build custom Linux image cho board cụ thể (BSP).
- Layer, recipe (Yocto), package selection (Buildroot).

### 4.3. Device Tree
- Cú pháp `.dts`/`.dtsi`, binding, overlay.
- Ánh xạ phần cứng (UART, I2C, SPI, GPIO) vào kernel driver qua Device Tree — kỹ năng sát với nền tảng UART/DMA driver đang có.

### 4.4. Kernel module & Driver
- Viết kernel module cơ bản (`insmod`/`rmmod`, `module_init`/`module_exit`).
- Character device driver, `ioctl`, sysfs interface.
- So sánh driver model Linux vs bare-metal HAL driver đã quen thuộc.

### 4.5. Cross-compilation & Toolchain
- GCC cross-toolchain, sysroot, `pkg-config` cho target khác host.
- Debug remote qua `gdbserver`.

### 4.6. Bootloader sâu (U-Boot)
- Cấu hình U-Boot, boot script, secure boot với U-Boot (liên hệ ECDSA signing đã dùng).

---

## Cấp độ 5 — Chuyên sâu & Kiến trúc hệ thống (Senior/Lead)

### 5.1. Kernel internals
- Scheduler (CFS), interrupt handling (top-half/bottom-half, tasklet, workqueue).
- **PREEMPT_RT patch** — Linux real-time, so sánh trực tiếp với FreeRTOS về latency/determinism.

### 5.2. Performance & Profiling
- `perf`, `ftrace`, `eBPF`/`bpftrace` — trace hệ thống mức sâu không cần recompile.
- Phân tích latency, CPU/memory bottleneck.

### 5.3. Security & Hardening
- SELinux/AppArmor, namespaces, capabilities (thay vì chỉ dùng root/non-root).
- Secure boot toàn chuỗi (U-Boot → kernel → rootfs verified boot, dm-verity, TPM cơ bản).
- Liên hệ trực tiếp kinh nghiệm cryptographic pipeline/ECDSA đã có.

### 5.4. Container & Virtualization
- Namespace, cgroups — nền tảng của Docker.
- Dùng container cho embedded (balena, Docker trên edge device) — biết khi nào nên/không nên dùng trên thiết bị resource-constrained.

### 5.5. OTA & System Update ở tầm Linux
- A/B partition update, RAUC/SWUpdate/Mender — so sánh với dual-bank OTA đã tự thiết kế trên STM32H523.
- Rollback strategy, atomic update.

### 5.6. Networking sâu & giao thức edge
- MQTT/CoAP stack trên Linux, network namespace cho multi-interface (WiFi + cellular modem).
- Quản lý kết nối cellular modem (đã có kinh nghiệm Quectel) qua ModemManager/ofono trên Linux thay vì AT command thuần.

### 5.7. Kiến trúc & vận hành ở quy mô lớn
- Thiết kế fleet management cho hàng nghìn thiết bị Linux edge (update, telemetry, remote debug).
- Viết/đọc kernel patch, đóng góp/patch driver upstream (kỹ năng phân biệt senior thực thụ với mid).
- Mentoring: review kiến trúc hệ thống, đánh giá trade-off real-time vs general-purpose OS cho từng bài toán.

---

## Gợi ý thứ tự học thực tế
1. Cấp 0 → 2: có thể học song song, mất khoảng 1–2 tháng nếu học đều.
2. Cấp 3: nên học kèm project thực tế (viết lại 1 driver UART hoặc OTA client bằng socket/pthread trên Linux) để thấm kiến thức.
3. Cấp 4: bắt đầu ngay khi có board chạy được Linux (Raspberry Pi hoặc board STM32MP1 vì cùng hãng ST đang quen) — build thử 1 image bằng Buildroot từ đầu.
4. Cấp 5: học qua việc **đọc kernel source thật** (không chỉ đọc sách) và tham gia review/patch một driver nhỏ.
