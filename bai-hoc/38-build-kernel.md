# Bài 38 — Build kernel và Linux tối giản trong QEMU

[Mục lục](../README.md) · [← Bài 37](37-virtualization.md) · [Bài 39 →](39-senior-troubleshooting.md)

## Mục tiêu và điều kiện

Cần bài 14, 16, 23, 37. Lab cụ thể dưới đây dành cho x86-64 Linux có compiler, make, flex, bison, bc, thư viện phát triển ELF/OpenSSL, cpio, gzip, QEMU x86 và BusyBox static. Dự trù nhiều GiB trống và RAM cho build. Không cài kernel thử nghiệm lên boot của host.

## 1. Các artifact cần phân biệt

Source kernel được cấu hình bằng Kconfig, lưu trong `.config`. `CONFIG_X=y` build vào kernel; `m` build module nếu tùy chọn hỗ trợ; tắt nghĩa là không có chức năng đó. Kernel image không tự chứa toàn bộ user space. Initramfs/rootfs cần chương trình init, thư viện nếu binary động, device access và công cụ cần thiết.

Compiler target phải khớp kiến trúc kernel/user space. Cross-compilation dùng toolchain cho target; Device Tree mô tả phần cứng trên nhiều nền tảng embedded, trong khi PC thường dùng cơ chế firmware như ACPI. Không dùng Device Tree như tên khác của driver.

## 2. Chuẩn bị source có phiên bản rõ

Tải một stable release từ [kernel.org](https://www.kernel.org/), xác minh checksum/chữ ký theo hướng dẫn nhà phát hành, giải nén trong `~/linux-lab/kernel/`. Ghi version và hash artifact vào hồ sơ. Không sao chép chuỗi VERSION chưa thay vào lệnh download.

Đi vào thư mục source đã giải nén rồi chạy:

```bash
make defconfig
scripts/config --enable BLK_DEV_INITRD
scripts/config --enable RD_GZIP
scripts/config --enable DEVTMPFS
scripts/config --enable SERIAL_8250
scripts/config --enable SERIAL_8250_CONSOLE
scripts/config --enable BINFMT_ELF
scripts/config --enable BINFMT_SCRIPT
scripts/config --enable PROC_FS
scripts/config --enable SYSFS
make olddefconfig
make -j2 bzImage
```

Giới hạn `-j2` để lab không tự dùng mọi CPU/RAM. Với cấu hình/phiên bản khác, đọc dependency trong `make menuconfig` và kiểm tra `.config` sau olddefconfig. Artifact x86 dự kiến là `arch/x86/boot/bzImage`.

## 3. Tạo initramfs có init riêng

Xác định BusyBox **static** từ package distro hoặc build phù hợp, dùng `file` và `readelf -l` kiểm tra không cần interpreter động. Chỉ sao chép binary động mà thiếu loader/thư viện sẽ dẫn tới lỗi chạy dù file tồn tại.

Trong cùng terminal, vẫn ở thư mục kernel source:

```bash
kernel_image="$PWD/arch/x86/boot/bzImage"
rootfs_dir=$(mktemp -d "$HOME/linux-lab/rootfs.XXXXXX")
mkdir -p "$rootfs_dir"/{bin,dev,proc,sys,tmp}
cp /usr/bin/busybox "$rootfs_dir/bin/busybox"
ln -s busybox "$rootfs_dir/bin/sh"
cat > "$rootfs_dir/init" <<'EOF'
#!/bin/sh
/bin/busybox mount -t devtmpfs devtmpfs /dev
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sysfs /sys
echo 'Minimal Linux ready'
while true; do
    /bin/sh
    echo 'Shell exited; PID 1 stays alive'
done
EOF
chmod +x "$rootfs_dir/init"
sudo mknod -m 600 "$rootfs_dir/dev/console" c 5 1
initramfs_file="$rootfs_dir.cpio.gz"
(cd "$rootfs_dir" && find . -print0 | cpio --null -o --format=newc --owner=0:0) | gzip > "$initramfs_file"
```

Đường BusyBox có thể khác; thay bằng binary static đã kiểm tra, không tiếp tục nếu chưa có. Device node console cần quyền phù hợp; nếu môi trường cấm mknod, dùng VM build hoặc công cụ gen_init_cpio của kernel theo tài liệu thay vì bỏ qua console.

## 4. Boot mà không gắn disk host

```bash
qemu-system-x86_64 -m 256M -smp 1 \
  -kernel "$kernel_image" -initrd "$initramfs_file" \
  -append 'console=ttyS0 rdinit=/init' \
  -nographic -no-reboot -nic none
```

Không bắt buộc `-enable-kvm`, nên có thể chạy bằng emulation chậm hơn. Trong shell guest dùng `/bin/busybox uname -a`, `/bin/busybox cat /proc/cmdline`, `/bin/busybox ps`. Shell tối giản có thể báo không có job control vì chưa thiết lập controlling terminal đầy đủ; đó khác lỗi boot. Dùng Ctrl+A rồi X để thoát QEMU ở chế độ này; guest không có disk bền nên thay đổi rootfs RAM mất sau thoát.

## 5. Chẩn đoán và kiểm tra đạt

| Lỗi | Kiểm tra |
|---|---|
| Không có console | SERIAL_8250_CONSOLE, `console=ttyS0`, frontend QEMU |
| No working init | Path `/init`, bit executable, shebang, BINFMT_SCRIPT |
| File tồn tại nhưng chạy báo not found | Dynamic loader hoặc sai kiến trúc |
| Kernel không đọc được archive | Format newc/gzip và RD_GZIP/BLK_DEV_INITRD |
| Panic khi init kết thúc | PID 1 đã thoát; giữ vòng đời init phù hợp |

Nộp `.config`, version source, lệnh build/boot, script init và log `Minimal Linux ready`. Giải thích vì sao hệ này không có systemd nhưng vẫn là Linux và vì sao build thành công chưa chứng minh đủ driver cho root disk thật.

## Đọc thêm

[Kernel build guide](https://docs.kernel.org/admin-guide/quickly-build-trimmed-linux.html), [initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html), [QEMU invocation](https://www.qemu.org/docs/master/system/invocation.html).
