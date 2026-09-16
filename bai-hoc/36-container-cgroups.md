# Bài 36 — Container, namespace và cgroups v2

[Mục lục](../README.md) · [← Bài 35](35-dong-thoi-va-khoa.md) · [Bài 37 →](37-virtualization.md)

## Mục tiêu

Cần bài 15, 19, 26, 32. Phân biệt cách ly tầm nhìn, hạn mức tài nguyên và quyền. Lab chạy trong VM systemd dùng cgroups v2.

## 1. Container là tổ hợp cơ chế

PID namespace thay cách nhìn PID; mount namespace tách cây mount; network namespace tách interface/route/socket; UTS tách hostname; user namespace ánh xạ UID/GID. Namespace không tự hạn chế RAM/CPU. Cgroup tổ chức task để accounting và điều khiển tài nguyên; nó không tự tạo filesystem riêng.

Container runtime kết hợp những cơ chế này với rootfs, capability, seccomp và cấu hình vòng đời. Seccomp lọc syscall theo policy; capability giới hạn đặc quyền; MAC thêm ràng buộc theo mô hình bảo mật. Container chia sẻ kernel host nên không có kernel riêng như VM.

Root trong user namespace không mặc nhiên là root toàn host, nhưng rootless cũng không có nghĩa không cần đánh giá mount, network và quyền tài nguyên được cấp.

## 2. Cgroups v2

Cgroups v2 dùng cây thống nhất; controller được bật theo cấu trúc và quyền quản lý. `cpu.max` giới hạn ngân sách thời gian CPU, `cpu.weight` chia tương đối khi tranh chấp. `memory.high` tạo áp lực reclaim/throttling phù hợp, `memory.max` là giới hạn cứng theo cơ chế memory controller. Các giới hạn cha vẫn ảnh hưởng con. [Tài liệu cgroups v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

Không ghi thủ công vào subtree do systemd/runtime sở hữu; dùng giao diện quản lý hoặc delegation phù hợp. `CPUQuota=50%` trong systemd tương ứng nửa thời gian một CPU, không phải nửa mọi CPU trên máy.

## 3. Lab: quota CPU bằng transient service

```bash
stat -fc %T /sys/fs/cgroup
sudo systemd-run --unit=linux-cpu-lab \
  -p CPUQuota=50% -p RuntimeMaxSec=15s \
  /usr/bin/python3 -c 'while True: pass'
systemctl show linux-cpu-lab -p ControlGroup -p CPUQuotaPerSecUSec
```

Trong thời gian service đang chạy, lấy path thật:

```bash
lab_cgroup=$(systemctl show linux-cpu-lab -p ControlGroup --value)
sudo cat "/sys/fs/cgroup$lab_cgroup/cpu.max"
sudo cat "/sys/fs/cgroup$lab_cgroup/cpu.stat"
```

Path cần không rỗng và service còn tồn tại; đừng vô tình đọc root rồi diễn giải thành service. Quan sát throttling counter trong lúc CPU-bound. Sau giới hạn thời gian, kiểm tra service đã dừng, `sudo systemctl stop linux-cpu-lab` nếu cần và `reset-failed` để dọn failed state. Nếu tên unit đã tồn tại, dùng tên mới.

## 4. Lab namespace không cài container engine

```bash
sudo unshare --mount --pid --fork --mount-proc sh -c 'echo "PID trong namespace: $$"; ps -ef'
```

Lệnh tạo PID/mount namespace tạm, mount proc tương ứng rồi thoát. Một số môi trường hạn chế unshare; ghi lại hạn chế thay vì thay sysctl host. So sánh process list bên trong với host, giải thích vì sao namespace PID cần proc mount phù hợp để nhìn nhất quán.

## 5. Rootfs và overlay

Overlay filesystem kết hợp lower layer và writable upper layer; lần sửa đầu có thể copy-up, xóa có thể được biểu diễn bằng whiteout. Image layer không thay volume cho dữ liệu cần giữ. Xóa container có thể mất writable layer; backup phải xác định dữ liệu nằm ở đâu.

## 6. Kiểm tra đạt

Nộp quota, counter và process list namespace. Giải thích vì sao host CPU rảnh mà container vẫn bị throttle, vì sao container có thể OOM khi host còn RAM, và vì sao đổi image distro không đổi kernel host.

## Đọc thêm

`man 7 namespaces`, `man unshare`, `man systemd.resource-control`, `man 2 seccomp`; [OverlayFS](https://docs.kernel.org/filesystems/overlayfs.html).
