# Bài 38 — Build kernel và Linux tối giản trong QEMU

[Mục lục](../README.md) · [← Bài 37](37-virtualization.md) · [Bài 39 →](39-senior-troubleshooting.md)

## Mục tiêu và phạm vi: một Linux nhỏ cần những phần nào?

Bạn muốn biết Linux hoạt động ra sao khi bỏ desktop và bộ quản lý dịch vụ lớn. Ta xây một nhân thử nghiệm, cung cấp vài chương trình tối thiểu trong bộ nhớ rồi cho QEMU chạy hệ ấy. “Build thành công” chỉ là có sản phẩm biên dịch; để boot được còn cần đúng kiến trúc, cấu hình, định dạng dữ liệu và chương trình đầu tiên.

**Build — tạo chương trình từ mã nguồn** thường gồm cấu hình, biên dịch và liên kết. **Kernel — nhân hệ điều hành** là lõi quản lý CPU, bộ nhớ và thiết bị. **QEMU** mô hình hóa một máy để chạy **guest — hệ khách** trong phạm vi riêng; **host — hệ chủ** chạy QEMU và cung cấp tài nguyên. Bài chỉ boot kernel trong guest, không cài vào đường khởi động host.

Sau bài này, bạn cần phân biệt source/config/image/initramfs, biết giải thích từ QEMU đến PID 1, tạo một archive root filesystem tối giản và chẩn đoán lỗi init/console. Cần bài 14, 16, 23, 37, nhưng các thuật ngữ cần dùng được nhắc lại.

**Môi trường cụ thể:** Linux x86-64, bộ công cụ C/build phù hợp phiên bản kernel, QEMU x86-64, BusyBox static cùng kiến trúc. Chuẩn bị nhiều GiB trống và RAM đủ cho source/build; **GiB** bằng 2^30 byte. Build tốn tài nguyên đáng kể nên làm trong máy/VM thử được phép. Không dùng `make install`, `modules_install`, cập nhật bootloader hoặc reboot host để làm bài. Nếu chưa có công cụ/nguồn thích hợp, hoàn thành nhánh kiểm tra archive và ghi rõ chưa build/boot.

## 1. Những sản phẩm nào khác nhau dù đều gọi là “Linux”?

**Source — mã nguồn** là văn bản chương trình và quy tắc build. **Compiler — trình biên dịch** chuyển mã như C thành mã máy; **linker — trình liên kết** ghép các phần thành sản phẩm thực thi. **Toolchain — bộ công cụ cho một kiến trúc** gồm compiler/linker và công cụ hỗ trợ.

**Kconfig** là hệ mô tả tùy chọn và phụ thuộc cấu hình của kernel. **`.config`** ghi các lựa chọn cụ thể. **Kernel image — ảnh nhân** là sản phẩm dùng để nạp/chạy nhân; trên lab x86, target `bzImage` tạo `arch/x86/boot/bzImage`. Nó không tự bao gồm tất cả chương trình user space.

**Module — thành phần kernel có thể nạp rời** cung cấp chức năng như một driver khi cấu hình hỗ trợ. **Driver — trình điều khiển thiết bị** giúp nhân giao tiếp phần cứng/thiết bị ảo. Với tùy chọn phù hợp: `CONFIG_X=y` đưa vào nhân, `m` build module, tắt thì không có. Không phải mọi tùy chọn đều cho `m`, và phụ thuộc có thể làm lựa chọn không được giữ sau bước cập nhật config. [Kconfig](https://docs.kernel.org/kbuild/kconfig.html).

**User space — chương trình ngoài nhân** gồm ứng dụng, thư viện và shell. **Init — chương trình khởi tạo đầu tiên của user space** có trách nhiệm giữ vòng đời hệ tối thiểu và khởi chạy các phần cần thiết. **Process — tiến trình** là một chương trình đang hoạt động; **PID — số nhận diện tiến trình** của init trong môi trường boot thông thường là 1.

**Root filesystem — cây tệp gốc** chứa những đường như `/init`, `/bin`, `/dev`. **Filesystem — hệ tổ chức tệp** quản lý tên, nội dung và thông tin tệp. **Initramfs — archive dùng cung cấp cây tệp ban đầu trong RAM** được nhân giải nén vào rootfs để có init và công cụ sớm. Lab chạy toàn bộ user space nhỏ từ đó, không chuyển sang disk.

```text
Mã nguồn + .config + toolchain → kernel image
BusyBox + /init + thư mục/nút thiết bị → initramfs
                         \             /
                          QEMU nạp cả hai
                                  |
                                  v
                         kernel guest khởi tạo
                                  |
                                  v
                       giải nén rootfs → chạy /init (PID 1)
                                  |
                                  v
                          shell và công cụ user space
```

Đọc hai nhánh vào QEMU: nhân và dữ liệu user space là hai sản phẩm riêng, cùng cần để có shell dùng được. [Rootfs/initramfs của kernel](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html).

## 2. Kiến trúc compiler, kernel và BusyBox phải khớp gì?

**Architecture — kiến trúc lệnh** quy định mã CPU hiểu, như x86-64 hoặc AArch64. **Native compilation — biên dịch cho cùng kiến trúc đang chạy** khác **cross-compilation — biên dịch cho kiến trúc đích khác máy build**. **Target — đích** của toolchain phải phù hợp kernel/user space guest; tên máy host không tự quyết định tất cả sản phẩm.

Ví dụ host x86-64 có thể build kernel AArch64 bằng toolchain cross phù hợp, nhưng phải chạy QEMU AArch64 với machine/boot/console phù hợp và BusyBox AArch64. Không đổi `ARCH` rồi dùng nguyên mọi lệnh x86 của bài.

**Device Tree — cây mô tả phần cứng** cung cấp dữ liệu cấu trúc về thiết bị/địa chỉ/kết nối trên nhiều nền tảng embedded. Nó không là driver: driver vẫn cần có và hiểu dữ liệu. **Firmware — phần mềm khởi tạo nền tảng** cung cấp một số thông tin/đường boot; PC x86 thường dùng **ACPI — giao diện bảng thông tin/quản lý nền tảng** thay vì suy mọi máy dùng Device Tree. [Device Tree usage model](https://docs.kernel.org/devicetree/usage-model.html).

## 3. Chọn source và ghi bằng chứng trước khi build

Tải một release phù hợp từ [kernel.org](https://www.kernel.org/), không chép số “mới nhất” cố định trong bài vì nó thay đổi. **Release — phiên bản được phát hành** khác source thay đổi theo nhánh phát triển. Ghi phiên bản, URL, thời điểm, config và toolchain dùng để có thể tái tạo.

**Checksum/hash — dấu tính từ nội dung** như SHA-256 giúp phát hiện file đổi so với giá trị đối chiếu. **Signature — chữ ký số** giúp xác minh nguồn theo khóa được tin cậy; checksum lấy từ cùng nơi không tin cậy không tự xác nhận tác giả. Với kernel.org, chữ ký archive `.tar.sign` được kiểm tra theo hướng dẫn đối với dữ liệu tar thích hợp, không mặc định ký trực tiếp file `.tar.xz`. [Kernel releases signatures](https://www.kernel.org/signature.html).

**Shell — trình nhận lệnh**, như Bash, chạy các lệnh. Chuẩn bị thư mục lab riêng rồi giải nén source đã kiểm chứng vào đó. Không có placeholder phiên bản chưa thay trong lệnh download của bài; ghi đường source thật vào biến `kernel_src` khi bắt đầu. `make kernelversion` trong source cho phiên bản của mã ấy, không phải nhân host đang chạy.

Các công cụ thường cần: compiler C, GNU make, flex/bison tạo bộ phân tích, bc tính toán, thư viện phát triển ELF/OpenSSL, cpio/gzip, QEMU và BusyBox static. **ELF** là định dạng tệp mã thực thi/phần đối tượng phổ biến Linux; **OpenSSL** cung cấp thư viện mật mã dùng ở một số bước build. Danh sách gói và mức phiên bản tối thiểu tùy kernel/distro; xem tài liệu source đang dùng. [Hướng dẫn build kernel](https://docs.kernel.org/admin-guide/quickly-build-trimmed-linux.html).

## 4. Lab A: cấu hình và build image x86 trong thư mục output riêng

Điều kiện: source đã giải nén/kiểm chứng, cây source chưa được build trực tiếp lẫn lộn, công cụ/phần trống đủ. **Output directory — thư mục sản phẩm build** tách khỏi source giúp lưu config/artifact riêng; `O=` của Kbuild chọn nó. Không trộn các lệnh có `O=` và không `O=` trong cùng quá trình.

Trong Bash, thay đường source dưới đây bằng đường thật trước khi chạy; biến output được tạo riêng:

```bash
kernel_src='/duong/dan/that/toi/linux-source'
test -f "$kernel_src/Makefile" || exit 1
kernel_src=$(realpath "$kernel_src")
build_dir=$(mktemp -d)
make -C "$kernel_src" O="$build_dir" ARCH=x86_64 defconfig
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable BLK_DEV_INITRD
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable RD_GZIP
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable DEVTMPFS
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable SERIAL_8250
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable SERIAL_8250_CONSOLE
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable BINFMT_ELF
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable BINFMT_SCRIPT
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable PROC_FS
"$kernel_src/scripts/config" --file "$build_dir/.config" --enable SYSFS
make -C "$kernel_src" O="$build_dir" ARCH=x86_64 olddefconfig
grep -E '^CONFIG_(BLK_DEV_INITRD|RD_GZIP|DEVTMPFS|SERIAL_8250|SERIAL_8250_CONSOLE|BINFMT_ELF|BINFMT_SCRIPT|PROC_FS|SYSFS)=' \
    "$build_dir/.config"
make -C "$kernel_src" O="$build_dir" ARCH=x86_64 -j2 bzImage
kernel_image="$build_dir/arch/x86/boot/bzImage"
test -s "$kernel_image" || exit 1
sha256sum "$kernel_image" "$build_dir/.config"
```

`-C` chọn source; `defconfig` tạo cấu hình mặc định của target, không là bản tối thiểu tuyệt đối. `scripts/config` chỉnh mong muốn; `olddefconfig` giải các tùy chọn mới/phụ thuộc với mặc định, nên cần xem **kết quả cuối**. Các mục lab cần `=y`, đặc biệt chức năng phải dùng trước khi có cơ chế nạp module. Nếu dòng thiếu/tắt/module, xem phụ thuộc qua `menuconfig`, không tiếp tục chỉ vì lệnh chỉnh đã trả 0. `-j2` giới hạn hai job build, không tự giới hạn toàn bộ RAM dùng.

Vai trò từng nhóm config:

| Nhóm | Cần cho điều gì? | Thiếu thì kiểm tra ở đâu? |
|---|---|---|
| BLK_DEV_INITRD/RD_GZIP | Nhận và giải nén archive gzip ban đầu | Log giải nén/không tìm init |
| DEVTMPFS | Cây các nút thiết bị ở `/dev` sau mount | Thiết bị cần thiết không hiện sau init |
| SERIAL_8250/CONSOLE | Console serial x86 của lab | Không thấy log trên ttyS0 |
| BINFMT_ELF/SCRIPT | Chạy BusyBox ELF và `/init` script | Init tồn tại nhưng không thực thi |
| PROC_FS/SYSFS | Cây thông tin tiến trình/thiết bị để quan sát | Mount tương ứng lỗi hoặc thiếu dữ liệu |

`.config` ghi đúng chưa chứng minh image đã build từ chính config ấy; giữ output và hash/bằng chứng lệnh. Với lỗi thiếu header/library, giải quyết theo bản source và distro, không vô hiệu tùy chọn bảo mật một cách tùy tiện để hết lỗi. [Kbuild output và biến build](https://docs.kernel.org/kbuild/kbuild.html).

## 5. BusyBox static giúp rootfs nhỏ ra sao?

**BusyBox** gom nhiều công cụ vào một chương trình: gọi `busybox mount` chạy chức năng mount, `busybox sh` chạy shell. **Applet — chức năng công cụ nằm trong BusyBox** phải được bật khi build BusyBox; binary static vẫn có thể thiếu applet cần.

**Static binary — chương trình đã liên kết thư viện cần vào sản phẩm** tránh phải mang loader/thư viện động thông thường vào rootfs. **Dynamic binary — chương trình cần thành phần tải/thư viện lúc chạy** có thể không chạy dù file đã copy. **Loader/interpreter của ELF — chương trình nạp động** được ghi trong đoạn INTERP; nếu thiếu ở rootfs, lỗi có thể là “not found”. [BusyBox FAQ](https://busybox.net/FAQ.html).

Chọn đường BusyBox static cùng x86-64 từ gói/bản build thích hợp. Không mặc định `/usr/bin/busybox` của mọi distro là static:

```bash
busybox_static='/duong/dan/that/toi/busybox-static'
file "$busybox_static"
readelf -l "$busybox_static"
"$busybox_static" --list
```

`file` mô tả kiến trúc/liên kết; `readelf` cho chương trình ELF có yêu cầu interpreter hay không. `--list` cần thấy `sh`, `mount`, `uname`, `cat`, `ps`; không có INTERP là một bằng chứng quan trọng nhưng còn cần đúng kiến trúc và kiểu liên kết thực tế. Không tiếp tục nhánh boot nếu chưa xác nhận.

## 6. Lab B: tạo initramfs mà không mknod bằng root

### 6.1. Vì sao cần console trước khi `/init` mount `/dev`?

**Console — kênh điều khiển/log chính** của guest giúp đọc lỗi và gõ lệnh. **Device node — nút thiết bị trong cây tệp** là đối tượng để chương trình truy cập thiết bị theo số định danh; nó không là file văn bản chứa dữ liệu thiết bị. `/dev/console` cần có trước lúc init mount devtmpfs để nhân chuẩn bị các luồng nhập/xuất của init.

**Mount — gắn một filesystem vào một thư mục** làm dữ liệu của filesystem ấy xuất hiện qua đường đó. **Mount point — thư mục điểm gắn** ở đây là `/dev`, `/proc`, `/sys`. **Devtmpfs** cung cấp nút thiết bị trong RAM; **procfs** cung cấp thông tin tiến trình/nhân dưới `/proc`; **sysfs** biểu diễn thông tin thiết bị/quan hệ nhân dưới `/sys`.

Ví dụ sau mount proc, `/proc/cmdline` chứa tham số nhân; nó không là file cấu hình đã chép từ host. Mount xảy ra **bên trong guest** theo script, không gắn filesystem vào host.

### 6.2. Dùng gen_init_cpio để đặt node trong archive

**Cpio newc — định dạng archive** chứa tên, kiểu đối tượng và dữ liệu mà initramfs Linux có thể dùng. `gen_init_cpio` của source kernel tạo archive từ danh sách, có thể mô tả device node mà không tạo node trên filesystem host. Chỉ build công cụ tạo archive nhỏ này nếu đã có source/gcc; không build/cài kernel host:

```bash
rootfs_dir=$(mktemp -d /tmp/linux-rootfs.XXXXXX)
mkdir -p "$rootfs_dir/bin"
cp "$busybox_static" "$rootfs_dir/bin/busybox"
cat > "$rootfs_dir/init" <<'INIT'
#!/bin/sh
/bin/busybox mount -t devtmpfs devtmpfs /dev || exit 1
/bin/busybox mount -t proc proc /proc || exit 1
/bin/busybox mount -t sysfs sysfs /sys || exit 1
echo 'Minimal Linux ready'
while true; do
    /bin/sh
    echo 'Shell exited; PID 1 stays alive'
done
INIT
# Helper chạy trên host: compiler native, không là compiler cross của guest.
gcc -O2 -o "$rootfs_dir/gen_init_cpio" "$kernel_src/usr/gen_init_cpio.c"
cat > "$rootfs_dir/archive.list" <<LIST
dir /bin 0755 0 0
dir /dev 0755 0 0
dir /proc 0755 0 0
dir /sys 0755 0 0
dir /tmp 1777 0 0
file /bin/busybox $rootfs_dir/bin/busybox 0755 0 0
slink /bin/sh busybox 0777 0 0
file /init $rootfs_dir/init 0755 0 0
nod /dev/console 0600 0 0 c 5 1
LIST
initramfs_file="$rootfs_dir/initramfs.cpio.gz"
"$rootfs_dir/gen_init_cpio" "$rootfs_dir/archive.list" > "$rootfs_dir/initramfs.cpio" || exit 1
gzip -c "$rootfs_dir/initramfs.cpio" > "$initramfs_file"
gzip -t "$initramfs_file"
gzip -dc "$initramfs_file" | cpio -it
```

Danh sách đặt UID/GID 0 cho đối tượng archive, không đổi owner của file host. `nod ... c 5 1` mô tả console loại ký tự, major 5/minor 1 theo giao diện Linux. `slink` tạo liên kết `/bin/sh` đến busybox; init có mode thực thi 0755 trong archive dù file nguồn không cần chmod riêng. Mẫu đường `/tmp/linux-rootfs.XXXXXX` không có khoảng trắng giúp cú pháp đường nguồn trong danh sách rõ; nếu dùng đường khác, đối chiếu format/helper source. [Tài liệu initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html).

**Shebang — dòng chọn chương trình chạy script** là `#!/bin/sh`; nhân tìm `/bin/sh`, symlink đến BusyBox đã có. Nếu init kết thúc, hệ tối giản này mất process chủ chốt và có thể panic. **Panic — nhân dừng vận hành bình thường vì lỗi nghiêm trọng** ở đây chỉ là lỗi guest nếu thử trong QEMU; không cố tạo panic host. Vòng `while true` giữ PID 1 sống sau khi người dùng thoát shell. Nó không là init production hoàn chỉnh: chưa xử lý signal/reaping mọi process mồ côi như một hệ dịch vụ đầy đủ.

`gzip -t` chỉ kiểm tra luồng nén, `cpio -it` liệt kê archive; phải thấy `init`, `bin/busybox`, `bin/sh`, `dev/console`. Chúng chưa chứng minh kernel có đủ config hoặc BusyBox đúng kiến trúc. Dừng nếu helper compile lỗi; đọc phiên bản source vì helper/toolchain có thể thay.

## 7. Lab C: boot guest không gắn disk host hoặc mạng

Điều kiện: image/archive hoàn tất và QEMU x86-64 đã cài. Các biến phải còn giá trị trong cùng Bash. Lệnh chạy VM thử với 256 MiB RAM, một vCPU, không disk host và không card mạng:

```bash
qemu-system-x86_64 -accel tcg -m 256M -smp 1 \
  -kernel "$kernel_image" -initrd "$initramfs_file" \
  -append 'console=ttyS0 rdinit=/init' \
  -nographic -no-reboot -nic none
```

`-accel tcg` chọn mô phỏng CPU, không cần quyền KVM nhưng có thể chậm. `-kernel/-initrd` đưa hai artifact vào boot; **kernel command line — tham số gửi cho nhân khi khởi động** nằm ở `-append`. `console=ttyS0` chọn serial console; `rdinit=/init` chọn init sớm trong initramfs. `-nographic` dùng terminal thay giao diện đồ họa; `-no-reboot` tránh vòng boot lại khó đọc lỗi; `-nic none` bỏ card mạng mặc định. [QEMU invocation](https://www.qemu.org/docs/master/system/invocation.html).

Đầu ra minh họa là dòng `Minimal Linux ready` rồi dấu nhắc shell. Trong guest:

```sh
/bin/busybox uname -a
/bin/busybox cat /proc/cmdline
/bin/busybox ps
/bin/busybox ls /dev
```

`uname` báo kernel guest bạn build, không kernel host; `/proc/cmdline` phải chứa `console=ttyS0 rdinit=/init`; `ps` cho PID 1 `/init` và shell con; `/dev` xác nhận devtmpfs đã gắn. BusyBox output khác procps-ng, không chờ cùng cột như hệ đầy đủ.

Shell có thể báo không có **job control — điều khiển công việc terminal** vì chưa có **controlling terminal — terminal gắn với phiên tiến trình** hoàn chỉnh. Điều đó khác không boot được. Dùng Ctrl+A rồi X theo bộ multiplex terminal của QEMU để thoát. Thay đổi rootfs guest trong RAM mất khi thoát; không có disk bền để lưu chúng.

Nếu không thấy log, không vội sửa host: kiểm tra đúng console, QEMU frontend và các config serial. Nếu thiếu công cụ QEMU, ghi rõ chưa chạy, không coi archive hợp lệ là đã boot.

## 8. Chẩn đoán theo bước cuối cùng đã thành công

| Hiện tượng | Giả thuyết và bằng chứng cần xem |
|---|---|
| Build dừng | Dòng lỗi đầu có ý nghĩa, dependency/toolchain, config/source và thư mục output |
| QEMU không nạp image | Path/size artifact, kiến trúc QEMU và định dạng image |
| Không có serial log | SERIAL_8250_CONSOLE=y, console=ttyS0, frontend nographic |
| Không giải nén được archive | gzip/newc, BLK_DEV_INITRD/RD_GZIP và thông báo boot |
| Không có init chạy được | `/init`, mode 0755, shebang, BINFMT_SCRIPT và `/bin/sh` |
| File có nhưng “not found” | ELF interpreter/thư viện động hoặc kiến trúc, không chỉ `ls` |
| Mount proc/sys/dev thất bại | Filesystem built-in và đúng đường đã có trong archive |
| Panic sau thoát init | PID 1 kết thúc; kiểm tra script/vòng đời init |

**Log — nhật ký sự kiện** của build/boot là bằng chứng; ghi đúng phiên bản/image/config trước khi sửa. Mỗi lượt đổi một yếu tố rồi thử lại để biết điều gì có tác dụng. Không giảm lỗi thành “QEMU hỏng” nếu boot đã tới init và thông báo chỉ thiếu loader.

**Kdump — cơ chế thu bộ nhớ khi kernel crash** dùng nhân thu dump và cấu hình riêng; **crash dump — dữ liệu trạng thái khi lỗi** giúp điều tra nhưng có thể chứa thông tin nhạy cảm. Đây là nhánh nghiên cứu nâng cao trên VM có kế hoạch riêng, không cần cấu hình hay cố gây panic để hoàn thành lab. [Kdump kernel guide](https://docs.kernel.org/admin-guide/kdump/kdump.html).

## 9. Tự kiểm tra và hồ sơ nộp

1. Kernel image build được nhưng thiếu BusyBox/init: có shell không? **Đối chiếu:** không; nhân và user space là hai nhánh riêng.
2. Config SERIAL console đặt=m có đủ cho log sớm trước module không? **Đối chiếu:** lab cần built-in=y và dependency phù hợp.
3. Copy BusyBox động vào rootfs mà không loader: file tồn tại có bảo đảm chạy? **Đối chiếu:** không; kiểm tra INTERP/kiến trúc/thư viện.
4. Gen_init_cpio đặt file UID 0 có đổi quyền root file host không? **Đối chiếu:** không, đó là metadata archive.
5. Hệ không có systemd có phải Linux không? **Đối chiếu:** có nếu chạy Linux kernel với init/user space phù hợp; systemd chỉ là một lựa chọn user space.
6. Boot initramfs được có chứng minh đủ driver root disk thật? **Đối chiếu:** không; lab không có disk đó và chưa thử đường truy cập.

Nộp source version/nguồn kiểm chứng, `.config`, hash artifact, lệnh build/boot, script init, danh sách archive và log `Minimal Linux ready` nếu đã boot. Ghi riêng bước chỉ kiểm tra cú pháp/archive và bước thực sự chạy; không dùng log minh họa làm bằng chứng.

**Tự nhắc lại:** source+config+toolchain tạo kernel; rootfs/initramfs cấp chương trình đầu tiên; kernel chạy PID 1 rồi user space dùng thiết bị qua nhân. Mỗi artifact có kiến trúc/phụ thuộc riêng. QEMU giữ thử nghiệm trong guest; build/boot thành công không tự là kernel phù hợp máy thật.

## Nguồn đối chiếu

- [Kernel build guide](https://docs.kernel.org/admin-guide/quickly-build-trimmed-linux.html), [Kconfig](https://docs.kernel.org/kbuild/kconfig.html), [Kbuild](https://docs.kernel.org/kbuild/kbuild.html), [kernel signatures](https://www.kernel.org/signature.html).
- [Initramfs/rootfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html), [init troubleshooting](https://docs.kernel.org/admin-guide/init.html), [Device Tree](https://docs.kernel.org/devicetree/usage-model.html).
- [BusyBox FAQ](https://busybox.net/FAQ.html), [QEMU invocation](https://www.qemu.org/docs/master/system/invocation.html), [kdump](https://docs.kernel.org/admin-guide/kdump/kdump.html): đối chiếu bản công cụ/source đang dùng.
