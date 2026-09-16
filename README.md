# Giáo trình Linux: từ cơ bản đến năng lực senior

Giáo trình gồm **40 bài, chia thành 8 chặng**, theo trình tự:

**Kiến trúc → sử dụng hệ thống → quản trị → cơ chế kernel → mạng và lưu trữ → bảo mật → hiệu năng → thiết kế và xử lý sự cố.**

Định hướng chính là **Linux System Engineer/SRE**, đồng thời xây dựng nền tảng để đi tiếp sang embedded Linux hoặc kernel development. Năng lực senior được đánh giá qua khả năng giải thích cơ chế, tìm nguyên nhân bằng bằng chứng và đưa ra quyết định kỹ thuật có cân nhắc; không chỉ qua số lượng lệnh biết dùng.

Mỗi bài có **file Markdown riêng** với giải thích cơ chế, ví dụ, lab, kết quả cần kiểm chứng, lỗi thường gặp và câu hỏi tự kiểm tra. Một bài chuyên sâu có thể cần nhiều buổi.

**Môi trường thực hành mặc định:** VM Debian/Ubuntu, Bash, systemd; các nhánh phụ thuộc distro hoặc kernel được ghi trong từng bài. Lệnh có `sudo` chỉ chạy trong VM lab đã chuẩn bị. Các placeholder như `PID`, `DEVICE`, `IP_SERVER` phải được thay bằng giá trị đã xác minh.

Các đoạn mã là hướng dẫn thực hành cho người học; lab yêu cầu quyền quản trị, nhiều VM hoặc build kernel cần được kiểm chứng trên môi trường tương ứng, không được hiểu là đã chạy sẵn trên máy của bạn.

## Mục lục

- [Danh sách 40 bài chi tiết](#bai-chi-tiet)
- [Cách sử dụng giáo trình](#cach-hoc)
- [Chặng 1 — Kiến trúc và môi trường](#chang-1)
- [Chặng 2 — Sử dụng Linux và quản lý dữ liệu](#chang-2)
- [Chặng 3 — Quản trị, boot và cứu hộ](#chang-3)
- [Chặng 4 — Kernel, bộ nhớ và lập lịch](#chang-4)
- [Chặng 5 — Lưu trữ, thiết bị và mạng](#chang-5)
- [Chặng 6 — Bảo mật và vận hành tin cậy](#chang-6)
- [Chặng 7 — Hiệu năng và cơ chế nâng cao](#chang-7)
- [Chặng 8 — Năng lực senior và chuyên môn hóa](#chang-8)
- [Các mốc đánh giá](#danh-gia)
- [Tài liệu tham khảo](#tai-lieu)

<a id="bai-chi-tiet"></a>
## Danh sách 40 bài chi tiết

| Bài | Nội dung |
|---|---|
| 01 | [Nền tảng máy tính và hệ điều hành](bai-hoc/01-nen-tang-may-tinh.md) |
| 02 | [Linux, GNU/Linux và bản phân phối](bai-hoc/02-linux-va-distro.md) |
| 03 | [Kiến trúc Linux và vai trò các thành phần](bai-hoc/03-kien-truc-linux.md) |
| 04 | [Linux và RTOS: đúng kết quả, đúng thời điểm](bai-hoc/04-linux-va-rtos.md) |
| 05 | [Yêu cầu phần cứng, cài đặt và môi trường lab](bai-hoc/05-cai-dat-va-lab.md) |
| 06 | [Terminal, shell và cách tự tra cứu](bai-hoc/06-terminal-va-shell.md) |
| 07 | [Cây thư mục và các loại file](bai-hoc/07-thu-muc-va-file.md) |
| 08 | [Thao tác file, pipe và redirect](bai-hoc/08-file-va-luong-du-lieu.md) |
| 09 | [Tìm kiếm, regex và xử lý văn bản](bai-hoc/09-xu-ly-van-ban.md) |
| 10 | [User, group và quyền truy cập](bai-hoc/10-user-va-phan-quyen.md) |
| 11 | [Package, repository và thư viện](bai-hoc/11-package-va-thu-vien.md) |
| 12 | [Tiến trình, thread và signal](bai-hoc/12-process-thread-signal.md) |
| 13 | [Shell scripting có kiểm soát lỗi](bai-hoc/13-shell-scripting.md) |
| 14 | [Toàn bộ quá trình boot và shutdown](bai-hoc/14-boot-va-shutdown.md) |
| 15 | [systemd, log và cứu hộ dịch vụ](bai-hoc/15-systemd-va-cuu-ho.md) |
| 16 | [System call và vòng đời chương trình](bai-hoc/16-system-call.md) |
| 17 | [Quản lý bộ nhớ và page fault](bai-hoc/17-quan-ly-bo-nho.md) |
| 18 | [Thuật toán lập lịch CPU](bai-hoc/18-ly-thuyet-lap-lich.md) |
| 19 | [Scheduler thực tế trong Linux](bai-hoc/19-scheduler-linux.md) |
| 20 | [Real-time scheduling và PREEMPT_RT](bai-hoc/20-real-time-linux.md) |
| 21 | [Storage stack và filesystem](bai-hoc/21-storage-filesystem.md) |
| 22 | [LVM, RAID, mã hóa và bảo vệ dữ liệu](bai-hoc/22-lvm-raid-backup.md) |
| 23 | [Driver, module và đường đi I/O](bai-hoc/23-driver-va-io.md) |
| 24 | [Nền tảng mạng Linux](bai-hoc/24-mang-linux.md) |
| 25 | [Dịch vụ mạng, reverse proxy và firewall](bai-hoc/25-service-firewall.md) |
| 26 | [Xác thực, capabilities và MAC](bai-hoc/26-xac-thuc-va-mac.md) |
| 27 | [Hardening và quản lý bản vá](bai-hoc/27-hardening-va-ban-va.md) |
| 28 | [Tự động hóa cấu hình với Ansible](bai-hoc/28-ansible.md) |
| 29 | [Quan sát và vận hành dịch vụ](bai-hoc/29-observability.md) |
| 30 | [Backup, recovery và quản lý thay đổi](bai-hoc/30-backup-recovery.md) |
| 31 | [Phương pháp tìm bottleneck](bai-hoc/31-phuong-phap-hieu-nang.md) |
| 32 | [Phân tích CPU và bộ nhớ chuyên sâu](bai-hoc/32-cpu-memory-performance.md) |
| 33 | [Phân tích hiệu năng I/O và mạng](bai-hoc/33-io-network-performance.md) |
| 34 | [Debugging, tracing và crash analysis](bai-hoc/34-debug-tracing-crash.md) |
| 35 | [Đồng thời, khóa và xử lý bất đồng bộ](bai-hoc/35-dong-thoi-va-khoa.md) |
| 36 | [Container, namespace và cgroups v2](bai-hoc/36-container-cgroups.md) |
| 37 | [Virtualization và thiết kế tài nguyên](bai-hoc/37-virtualization.md) |
| 38 | [Build kernel và Linux tối giản trong QEMU](bai-hoc/38-build-kernel.md) |
| 39 | [Thiết kế và xử lý sự cố ở mức senior](bai-hoc/39-senior-troubleshooting.md) |
| 40 | [Đồ án tổng hợp và bảo vệ quyết định kỹ thuật](bai-hoc/40-do-an-tong-hop.md) |

<a id="cach-hoc"></a>
## Cách sử dụng giáo trình

Học theo thứ tự để kiến thức mới có nền tảng từ các bài trước. Các bài kernel chuyên sâu cần bổ sung C cơ bản: con trỏ, quản lý bộ nhớ, biên dịch, liên kết và chương trình đa luồng.

Dùng **một ứng dụng nhỏ xuyên suốt giáo trình**: chạy bằng shell → quản lý bằng systemd → phục vụ qua mạng → chạy với user riêng → thêm backup và monitoring → giới hạn tài nguyên → chạy trong container → tạo tải và phân tích.

Mỗi bài lưu lại bốn đầu ra:

1. Sơ đồ hoặc lời giải thích cơ chế bằng ngôn ngữ của mình.
2. Lệnh và cấu hình có thể tái tạo kết quả.
3. Một lỗi chủ động tạo trong lab và cách tìm nguyên nhân.
4. Bằng chứng kiểm tra sau khi sửa.

Thực hành boot, phân vùng, filesystem, kernel và chính sách real-time trong VM có snapshot. Ghi lại distro, phiên bản kernel và cấu hình liên quan vì hành vi có thể khác giữa các hệ thống.

<a id="chang-1"></a>
## Chặng 1 — Hiểu Linux và chuẩn bị môi trường

**Mục tiêu:** Hiểu hệ điều hành đứng ở đâu trong máy tính, vai trò từng thành phần và sự khác biệt với RTOS.

### Bài 1. Nền tảng máy tính và hệ điều hành

[Đọc bài 01 chi tiết](bai-hoc/01-nen-tang-may-tinh.md)

- **Cần nắm:** CPU, core, hardware thread, register, cache, RAM, storage và bus; mã máy được thực thi ra sao; interrupt, timer, DMA; vai trò hệ điều hành trong quản lý và chia sẻ tài nguyên.
- **Thực hành:** Xem cấu hình bằng `lscpu`, `free -h`, `lsblk`, `lspci`; vẽ sơ đồ CPU–RAM–thiết bị của máy đang dùng.
- **Lưu ý:** Phân biệt core với thread, RAM với storage, latency với throughput. Đây là nền tảng cho lập lịch và hiệu năng.

### Bài 2. Linux, GNU/Linux và bản phân phối

[Đọc bài 02 chi tiết](bai-hoc/02-linux-va-distro.md)

- **Cần nắm:** Kernel, user space, distribution; distro đóng gói kernel, thư viện và công cụ như thế nào; package manager, repository, release và vòng đời hỗ trợ.
- **Thực hành:** Đọc `/etc/os-release`, chạy `uname -r`; phân biệt phiên bản distro với kernel.
- **Lưu ý:** Hai máy Linux có thể khác init system, network manager, package manager và cấu hình kernel. Không mặc định hướng dẫn áp dụng giống nhau.

### Bài 3. Tổng quan kiến trúc và vai trò thành phần

[Đọc bài 03 chi tiết](bai-hoc/03-kien-truc-linux.md)

- **Cần nắm:** Ranh giới user space/kernel space; system call; Linux là kernel nguyên khối có hỗ trợ module; đường đi từ ứng dụng đến phần cứng.
- **Thực hành:** Giải thích khi chạy `cat file.txt`: shell tạo tiến trình, chương trình mở và đọc file, kernel xử lý, dữ liệu được ghi ra terminal.
- **Lưu ý:** Thư viện có thể bọc system call, nhưng không phải mọi hàm thư viện đều gọi kernel.

```text
User space
  Ứng dụng / shell / dịch vụ / giao diện đồ họa
                   ↓
         Thư viện và runtime
                   ↓
           System call interface
─────────────────────────────────────────────
Kernel space
  Scheduler | Memory manager | VFS/filesystem
  Network stack | IPC | Security | Drivers
                   ↓
          CPU / RAM / thiết bị
```

Sơ đồ trên là mô hình khái niệm; các subsystem trong kernel tương tác với nhau, không phải một chuỗi gọi tuyến tính duy nhất.

| Thành phần | Vai trò chính |
|---|---|
| Firmware: BIOS/UEFI | Khởi tạo nền tảng phần cứng và bắt đầu chuỗi boot |
| Bootloader | Chọn, nạp kernel, truyền tham số; có thể nạp initramfs |
| Kernel | Quản lý CPU, bộ nhớ, thiết bị, filesystem, mạng và bảo vệ |
| Scheduler | Chọn task nào chạy trên CPU nào, vào thời điểm nào |
| Memory manager | Quản lý bộ nhớ ảo, trang nhớ, cấp phát, reclaim và swap |
| VFS và filesystem | Cung cấp giao diện file thống nhất và tổ chức dữ liệu |
| Driver | Điều khiển thiết bị, kết nối chúng với subsystem của kernel |
| Network stack | Xử lý socket, giao thức, routing và gói tin |
| IPC | Cung cấp cơ chế giao tiếp và phối hợp giữa tiến trình |
| System call interface | Điểm vào được kiểm soát để user space yêu cầu kernel làm việc |
| glibc, musl và thư viện khác | Cung cấp API, thường bao gồm wrapper cho system call |
| Init/PID 1 | Khởi tạo user space, quản lý dịch vụ, tham gia shutdown |
| Daemon/service | Cung cấp chức năng nền như SSH, logging, đồng bộ thời gian |
| Shell và CLI utilities | Điều khiển và tự động hóa bằng lệnh |
| Display server/compositor, desktop | Cung cấp giao diện đồ họa; không bắt buộc với server |
| Package manager | Cài đặt, cập nhật và quản lý dependency của phần mềm |

### Bài 4. Linux khác RTOS như thế nào?

[Đọc bài 04 chi tiết](bai-hoc/04-linux-va-rtos.md)

- **Cần nắm:** General-purpose OS; hard, firm, soft real-time; deadline, jitter, worst-case execution time; tính dự đoán được của thời gian đáp ứng.
- **Thực hành:** So sánh web server, thiết bị phát âm thanh và bộ điều khiển động cơ; giải thích yêu cầu thời gian của từng hệ thống.
- **Lưu ý:** Real-time không đồng nghĩa với chạy nhanh. Đáp ứng trung bình nhanh vẫn có thể vi phạm deadline.

| Tiêu chí | Linux thông thường | RTOS |
|---|---|---|
| Mục tiêu phổ biến | Cân bằng throughput, công bằng, khả năng tương tác | Đáp ứng yêu cầu thời gian xác định |
| Môi trường điển hình | Server, desktop, thiết bị nhúng đủ tài nguyên | Điều khiển, vi điều khiển, thiết bị nhúng |
| Tài nguyên | Thường có bộ nhớ và dịch vụ phong phú | Có thể hoạt động với tài nguyên hạn chế |
| Lập lịch | Nhiều policy/class cho nhiều workload | Thường nhấn mạnh ưu tiên và tính dự đoán được |
| Bộ nhớ | Thường sử dụng virtual memory và MMU | Có thể dùng MPU, MMU hoặc không có chúng |
| Đảm bảo deadline | Không tự động có trên hệ thống mặc định | Vẫn phụ thuộc ứng dụng, cấu hình và phần cứng |

Linux có cơ chế real-time và cấu hình PREEMPT_RT, nhưng deadline phải được đánh giá trên **toàn hệ thống**. RTOS cũng không dùng chung một thuật toán lập lịch; ví dụ [Zephyr có các quy tắc và lựa chọn riêng](https://docs.zephyrproject.org/latest/kernel/services/scheduling/index.html).

### Bài 5. Yêu cầu phần cứng, cài đặt và thiết kế lab

[Đọc bài 05 chi tiết](bai-hoc/05-cai-dat-va-lab.md)

- **Cần nắm:** Kiến trúc CPU được hỗ trợ; yêu cầu kernel khác yêu cầu distro và ứng dụng; RAM, storage, firmware, driver; bare metal, VM và container.
- **Thực hành:** Cài một VM Linux, tạo snapshot, cấu hình NAT và mạng lab; ghi lại thông số hệ thống.
- **Lưu ý:** Không có cấu hình tối thiểu chung cho mọi Linux. Đối chiếu distro, phiên bản và kiểu cài đặt trong tài liệu của nhà phân phối, chẳng hạn [hướng dẫn Debian](https://www.debian.org/releases/stable/amd64/index).

Cấu hình dưới đây là **gợi ý phục vụ học tập**, không phải yêu cầu tối thiểu:

| Môi trường | Cấu hình gợi ý |
|---|---|
| Một VM học CLI | 2 vCPU, RAM 2–4 GB, ổ đĩa 25–40 GB |
| Máy host chạy lab nhỏ | CPU hỗ trợ ảo hóa, RAM 16 GB, SSD trống khoảng 100 GB |
| Nhiều VM, tracing, build kernel | RAM 32 GB, SSD trống từ 150 GB sẽ thuận tiện hơn |

Dùng một distro chính trước. Sau khi nắm quản trị cơ bản, bổ sung distro thuộc họ khác để học cách phân biệt kiến thức Linux chung với công cụ riêng của distro.

<a id="chang-2"></a>
## Chặng 2 — Sử dụng Linux và quản lý dữ liệu

**Mục tiêu:** Làm việc thành thạo với shell, file, luồng dữ liệu và quyền truy cập.

### Bài 6. Terminal, shell và tự tra cứu

[Đọc bài 06 chi tiết](bai-hoc/06-terminal-va-shell.md)

- **Cần nắm:** Terminal khác shell; cấu trúc lệnh, option, argument; `PATH`, biến môi trường; quoting và wildcard.
- **Thực hành:** Dùng `man`, `help`, `type`, `command -v`; thao tác với tên file chứa khoảng trắng.
- **Mẹo:** Tra đúng manual section: section 1 cho lệnh, 2 cho system call, 3 cho hàm thư viện.

### Bài 7. Cây thư mục và các loại file

[Đọc bài 07 chi tiết](bai-hoc/07-thu-muc-va-file.md)

- **Cần nắm:** `/`, `/etc`, `/var`, `/usr`, `/home`, `/run`, `/tmp`, `/dev`, `/proc`, `/sys`; đường dẫn tuyệt đối/tương đối; regular file, directory, symlink, device, socket, FIFO.
- **Thực hành:** Dùng `ls`, `stat`, `file`, `readlink`, `find`; khảo sát `/proc` và `/sys`.
- **Lưu ý:** `/proc` và `/sys` là giao diện đến trạng thái kernel, không phải dữ liệu thông thường trên ổ đĩa.

### Bài 8. Thao tác file và luồng dữ liệu

[Đọc bài 08 chi tiết](bai-hoc/08-file-va-luong-du-lieu.md)

- **Cần nắm:** `cp`, `mv`, `rm`, `mkdir`; stdin/stdout/stderr; pipe, redirect, append và exit status.
- **Thực hành:** Tạo pipeline lọc log, tách kết quả khỏi lỗi; dùng `tee`, `head`, `tail`, `wc`.
- **Lưu ý:** `>` có thể làm rỗng file trước khi lệnh đọc nó. Không đọc rồi redirect trực tiếp về cùng file.

### Bài 9. Tìm kiếm và xử lý văn bản

[Đọc bài 09 chi tiết](bai-hoc/09-xu-ly-van-ban.md)

- **Cần nắm:** `grep`/`rg`, `sort`, `uniq`, `cut`, `tr`, `sed`, `awk`; regex; dữ liệu dòng và dữ liệu có cấu trúc.
- **Thực hành:** Thống kê mã HTTP, IP, endpoint từ access log; dùng `jq` với JSON.
- **Mẹo:** Dùng parser đúng định dạng cho JSON, YAML, CSV; tránh cố giải quyết mọi thứ bằng regex.

### Bài 10. User, group và phân quyền

[Đọc bài 10 chi tiết](bai-hoc/10-user-va-phan-quyen.md)

- **Cần nắm:** UID/GID; owner/group/other; `rwx`; quyền thư mục; `umask`; setuid, setgid, sticky bit; ACL; `sudo`.
- **Thực hành:** Tạo thư mục dùng chung cho nhóm; chẩn đoán quyền bằng `id`, `namei -l`, `getfacl`.
- **Lưu ý:** Quyền xóa file chủ yếu phụ thuộc thư mục chứa nó. `chmod 777` không phải cách sửa lỗi quyền mặc định.

<a id="chang-3"></a>
## Chặng 3 — Quản trị, boot và cứu hộ

**Mục tiêu:** Quản lý phần mềm, tiến trình, dịch vụ; hiểu và khôi phục chuỗi khởi động.

### Bài 11. Quản lý phần mềm và thư viện

[Đọc bài 11 chi tiết](bai-hoc/11-package-va-thu-vien.md)

- **Cần nắm:** Package, repository, dependency, chữ ký; cài/cập nhật/gỡ; executable, shared library, dynamic linker; nguồn hệ thống và nguồn bên ngoài.
- **Thực hành:** Tìm package sở hữu file, xem dependency, cài phiên bản cần thiết từ nguồn phù hợp.
- **Lưu ý:** Tránh để package manager hệ thống, trình quản lý ngôn ngữ và cài thủ công ghi đè cùng khu vực.

### Bài 12. Tiến trình, thread và signal

[Đọc bài 12 chi tiết](bai-hoc/12-process-thread-signal.md)

- **Cần nắm:** PID/PPID, process/thread; `fork`–`exec`–`wait`; trạng thái running, sleeping, stopped, zombie; foreground/background; signal.
- **Thực hành:** Dùng `ps`, `pstree`, `top`, `jobs`, `fg`, `bg`, `kill`; quan sát xử lý `SIGTERM`.
- **Lưu ý:** `SIGKILL` không cho ứng dụng dọn dẹp. Zombie đã kết thúc thực thi và cần cha thu hồi trạng thái.

### Bài 13. Shell scripting và tự động hóa cơ bản

[Đọc bài 13 chi tiết](bai-hoc/13-shell-scripting.md)

- **Cần nắm:** Biến, điều kiện, vòng lặp, function, argument, exit code, `trap`, file tạm, khóa chống chạy trùng.
- **Thực hành:** Viết script backup có kiểm tra đầu vào, log, xử lý lỗi; kiểm tra bằng ShellCheck.
- **Lưu ý:** Quote biến chứa đường dẫn; hiểu ngữ cảnh của `set -e` và `pipefail`. Chạy thành công một lần chưa đủ để coi script là tin cậy.

### Bài 14. Toàn bộ quá trình boot và shutdown

[Đọc bài 14 chi tiết](bai-hoc/14-boot-va-shutdown.md)

- **Cần nắm:** Firmware, cơ chế nạp kernel, kernel initialization, early user space, root filesystem, PID 1, dịch vụ và login; kernel command line; initramfs; shutdown và unmount.
- **Thực hành:** Liên hệ từng giai đoạn với `/proc/cmdline`, `/boot`, `dmesg`, `journalctl -b`, `systemd-analyze`.
- **Lưu ý:** Luồng dưới đây là điển hình. UEFI có thể nạp kernel qua EFI stub; một số hệ thống không cần initramfs. Dịch vụ khởi động theo dependency, không nhất thiết tuần tự.

```text
Bật nguồn / reset
    ↓
Firmware BIOS hoặc UEFI
    ↓
Bootloader hoặc cơ chế nạp EFI phù hợp
    ↓
Kernel + tham số boot + initramfs nếu có
    ↓
Kernel khởi tạo CPU, bộ nhớ, driver và subsystem
    ↓
Early user space: tìm/mở khóa/chuẩn bị root filesystem nếu cần
    ↓
Chuyển sang root filesystem thực
    ↓
Init/PID 1
    ↓
Mount, dịch vụ, mạng theo dependency
    ↓
Login / ứng dụng
```

### Bài 15. systemd, log và cứu hộ

[Đọc bài 15 chi tiết](bai-hoc/15-systemd-va-cuu-ho.md)

- **Cần nắm:** Service, socket, timer, target, mount unit; dependency và ordering; journal, log rotation; rescue/emergency mode.
- **Thực hành:** Viết service có user riêng, restart policy, giới hạn tài nguyên; tạo lỗi service hoặc `fstab` trong VM rồi khôi phục.
- **Lưu ý:** `After=` quy định thứ tự, không tự kéo unit kia lên. Phân biệt `enable` với `start`; đọc ngữ cảnh log thay vì chỉ dòng lỗi cuối.

<a id="chang-4"></a>
## Chặng 4 — Kernel, bộ nhớ và lập lịch

**Mục tiêu:** Giải thích chương trình tương tác với kernel ra sao và tài nguyên được phân phối thế nào.

### Bài 16. System call và vòng đời chương trình

[Đọc bài 16 chi tiết](bai-hoc/16-system-call.md)

- **Cần nắm:** User/kernel mode; ELF, loader, file descriptor; `open`, `read`, `write`, `mmap`, `execve`; errno.
- **Thực hành:** Dùng `strace` quan sát đọc file và kết nối mạng; viết chương trình C nhỏ để kiểm chứng.
- **Lưu ý:** `strace` quan sát system call và signal, không thể hiện mọi hoạt động trong chương trình; tracing có thể thay đổi timing.

### Bài 17. Quản lý bộ nhớ

[Đọc bài 17 chi tiết](bai-hoc/17-quan-ly-bo-nho.md)

- **Cần nắm:** Virtual/physical memory; page table, MMU, TLB; stack/heap; demand paging, page fault, copy-on-write; page cache, reclaim, swap, OOM; NUMA nhập môn.
- **Thực hành:** Đọc `/proc/<pid>/maps`, `smaps`; dùng `free`, `vmstat`; quan sát RSS, bộ nhớ dùng chung và cache.
- **Lưu ý:** RAM free thấp không tự động nghĩa là thiếu RAM. Phân biệt bộ nhớ được cấp phát, đã được chạm đến và thực sự resident.

### Bài 18. Lý thuyết thuật toán lập lịch CPU

[Đọc bài 18 chi tiết](bai-hoc/18-ly-thuyet-lap-lich.md)

- **Cần nắm:** Preemptive/non-preemptive; FCFS, SJF, SRTF, Round Robin, priority scheduling, multilevel feedback queue; starvation, aging; turnaround, waiting, response time.
- **Thực hành:** Vẽ Gantt chart cho cùng tập tiến trình dưới các thuật toán; tính thời gian chờ/đáp ứng; thay đổi quantum để so sánh.
- **Lưu ý:** Đây là mô hình để hiểu trade-off, không phải danh sách policy Linux triển khai nguyên dạng.

### Bài 19. Scheduler thực tế trong Linux

[Đọc bài 19 chi tiết](bai-hoc/19-scheduler-linux.md)

- **Cần nắm:** Scheduling class/policy; per-CPU run queue, preemption, affinity, load balancing; nice/weight; CFS và `vruntime`; EEVDF và virtual deadline; `SCHED_OTHER`, `SCHED_BATCH`, `SCHED_IDLE`.
- **Thực hành:** So sánh workload CPU-bound với `nice`, `taskset`; quan sát context switch và migration.
- **Lưu ý:** Không mô tả mọi kernel bằng câu “Linux dùng CFS”. Linux bắt đầu chuyển phần lập lịch công bằng sang EEVDF từ kernel 6.6; kiểm tra kernel và backport của distro. Xem [tài liệu EEVDF](https://kernel.org/doc/html/latest/scheduler/sched-eevdf.html).

### Bài 20. Lập lịch real-time và PREEMPT_RT

[Đọc bài 20 chi tiết](bai-hoc/20-real-time-linux.md)

- **Cần nắm:** `SCHED_FIFO`, `SCHED_RR`, `SCHED_DEADLINE`; Rate Monotonic, EDF; runtime/period/deadline; admission control; priority inversion/inheritance; interrupt latency, scheduling latency; PREEMPT_RT.
- **Thực hành:** Đo phân bố latency dưới tải trong lab; so sánh policy; giải thích vì sao trung bình tốt nhưng có spike.
- **Lưu ý:** Task real-time sai thiết kế có thể khiến task khác thiếu CPU. EDF của `SCHED_DEADLINE` khác virtual deadline của EEVDF. Linux kết hợp EDF với CBS trong policy deadline; xem [tài liệu SCHED_DEADLINE](https://kernel.org/doc/html/latest/scheduler/sched-deadline.html).

<a id="chang-5"></a>
## Chặng 5 — Lưu trữ, thiết bị và mạng

**Mục tiêu:** Theo được đường đi của dữ liệu từ ứng dụng đến ổ đĩa hoặc qua mạng.

### Bài 21. Storage stack và filesystem

[Đọc bài 21 chi tiết](bai-hoc/21-storage-filesystem.md)

- **Cần nắm:** Block device → partition → lớp ánh xạ tùy chọn → filesystem → VFS → ứng dụng; GPT/MBR; inode, dentry, hard link, symlink; mount, UUID; khái niệm ext4/XFS/Btrfs.
- **Thực hành:** Gắn ổ ảo, phân vùng, tạo filesystem, mount bằng UUID; kiểm chứng hard link/symlink.
- **Lưu ý:** Đầy dung lượng khác hết inode. Xác định đúng thiết bị bằng nhiều dấu hiệu trước khi format.

### Bài 22. LVM, RAID và bảo vệ dữ liệu

[Đọc bài 22 chi tiết](bai-hoc/22-lvm-raid-backup.md)

- **Cần nắm:** PV/VG/LV; RAID và dạng hỏng; snapshot; mã hóa ổ đĩa; backup full/incremental; RPO/RTO; restore.
- **Thực hành:** Mở rộng logical volume và filesystem trong lab; backup rồi khôi phục sang máy khác.
- **Lưu ý:** RAID và snapshot không thay thế backup độc lập. Không phải filesystem nào cũng hỗ trợ thu nhỏ.

### Bài 23. Driver, module và I/O

[Đọc bài 23 chi tiết](bai-hoc/23-driver-va-io.md)

- **Cần nắm:** Built-in driver/module; device model, sysfs, udev; block/character device; interrupt, DMA; buffered/direct I/O; writeback, `fsync`; I/O scheduler.
- **Thực hành:** Dùng `lsmod`, `modinfo`, `udevadm`; truy vết thiết bị, driver và node trong `/dev`.
- **Lưu ý:** Driver khác firmware thiết bị. CPU scheduler và I/O scheduler giải quyết hai bài toán khác nhau.

### Bài 24. Nền tảng mạng trên Linux

[Đọc bài 24 chi tiết](bai-hoc/24-mang-linux.md)

- **Cần nắm:** Ethernet, MAC, ARP/NDP; IPv4/IPv6, subnet; routing, default gateway; TCP/UDP, DNS, DHCP; loopback, socket.
- **Thực hành:** Kết nối hai VM; dùng `ip addr`, `ip route`, `ip neigh`, `ss`, `dig`, `curl`, `tcpdump`.
- **Lưu ý:** Ping thành công không chứng minh ứng dụng hoạt động. Kiểm tra lần lượt link, IP, route, DNS, transport, ứng dụng.

### Bài 25. Dịch vụ mạng, firewall và luồng gói tin

[Đọc bài 25 chi tiết](bai-hoc/25-service-firewall.md)

- **Cần nắm:** SSH, HTTP/TLS, reverse proxy; bind address/listen port; connection tracking, stateful firewall, NAT; input/output/forward; bridge, network namespace nhập môn.
- **Thực hành:** Dựng web service sau reverse proxy, giới hạn truy cập; dùng packet capture tìm lỗi kết nối.
- **Lưu ý:** Listen trên `127.0.0.1` khác `0.0.0.0`. Khi sửa firewall từ xa, chuẩn bị cách phục hồi kết nối.

<a id="chang-6"></a>
## Chặng 6 — Bảo mật và vận hành tin cậy

**Mục tiêu:** Biến một máy chạy được thành hệ thống có thể quản lý, bảo vệ và khôi phục.

### Bài 26. Xác thực và kiểm soát truy cập nâng cao

[Đọc bài 26 chi tiết](bai-hoc/26-xac-thuc-va-mac.md)

- **Cần nắm:** PAM, NSS; authentication/authorization; capabilities; SELinux/AppArmor; DAC/MAC; tài khoản service, least privilege.
- **Thực hành:** Chạy service bằng user riêng; xác định lỗi do quyền file, capability hay chính sách MAC.
- **Lưu ý:** Không tắt SELinux/AppArmor chỉ vì thấy permission denied; xác định rule hoặc nhãn gây lỗi.

### Bài 27. Hardening và quản lý bản vá

[Đọc bài 27 chi tiết](bai-hoc/27-hardening-va-ban-va.md)

- **Cần nắm:** Attack surface; SSH key, `sudo`, secret; repository tin cậy; cập nhật bảo mật; audit và đồng bộ thời gian.
- **Thực hành:** Tạo baseline bảo mật, kiểm kê cổng/dịch vụ; diễn tập cập nhật có rollback.
- **Lưu ý:** Không đưa secret vào Git, command history hoặc log. Đánh giá bản vá theo cấu hình và thông tin của distro.

### Bài 28. Tự động hóa cấu hình

[Đọc bài 28 chi tiết](bai-hoc/28-ansible.md)

- **Cần nắm:** Desired state, idempotency, inventory, template, handler; Git; provisioning khác configuration management.
- **Thực hành:** Dùng Ansible dựng lại user, package, firewall và service trên máy sạch.
- **Lưu ý:** Automation cần chạy lại an toàn và kiểm chứng được. Lần chạy thứ hai không phát sinh thay đổi vô nghĩa là tiêu chí tốt.

### Bài 29. Vận hành dịch vụ và quan sát hệ thống

[Đọc bài 29 chi tiết](bai-hoc/29-observability.md)

- **Cần nắm:** Log, metric, trace; health/readiness; SLI/SLO, alert; resource limit; graceful shutdown; thời gian, timezone, clock.
- **Thực hành:** Thu thập metric máy và ứng dụng; tạo cảnh báo có hướng xử lý; phân biệt active với thực sự phục vụ được yêu cầu.
- **Lưu ý:** Cảnh báo cần thể hiện ảnh hưởng hoặc nguy cơ cụ thể; tránh áp dụng một ngưỡng CPU cho mọi workload.

### Bài 30. Backup, recovery và quản lý thay đổi

[Đọc bài 30 chi tiết](bai-hoc/30-backup-recovery.md)

- **Cần nắm:** Application-consistent backup; restore drill; maintenance window; canary, rollback, runbook; disaster recovery.
- **Thực hành:** Khôi phục dịch vụ và dữ liệu trên VM mới; đo mất dữ liệu và thời gian phục hồi.
- **Lưu ý:** Backup báo thành công chưa chứng minh restore được. Sao chép trực tiếp file database đang chạy có thể không nhất quán.

<a id="chang-7"></a>
## Chặng 7 — Hiệu năng và cơ chế nâng cao

**Mục tiêu:** Chẩn đoán bằng giả thuyết và số liệu, hiểu giới hạn của công cụ đo.

### Bài 31. Phương pháp tìm bottleneck

[Đọc bài 31 chi tiết](bai-hoc/31-phuong-phap-hieu-nang.md)

- **Cần nắm:** Utilization, saturation, errors; baseline; throughput, latency, percentile; queueing; CPU/memory/I/O-bound; thiết kế phép đo.
- **Thực hành:** Lập và kiểm chứng giả thuyết cho ứng dụng chậm bằng `vmstat`, `iostat`, `pidstat`, `ss`, `sar`, metric ứng dụng.
- **Lưu ý:** Load average không phải phần trăm CPU. Tương quan chưa chứng minh quan hệ nhân quả.

### Bài 32. Phân tích CPU và bộ nhớ chuyên sâu

[Đọc bài 32 chi tiết](bai-hoc/32-cpu-memory-performance.md)

- **Cần nắm:** User/system CPU time; run queue, context switch, cache miss; NUMA locality; reclaim, major page fault, memory pressure, PSI; OOM trong cgroup.
- **Thực hành:** Tạo tải có kiểm soát; phân biệt thiếu CPU, chờ khóa, thiếu RAM và giới hạn tài nguyên.
- **Lưu ý:** Thêm thread có thể chậm hơn do contention. Không xóa cache như cách tối ưu RAM mặc định.

### Bài 33. Phân tích I/O và mạng

[Đọc bài 33 chi tiết](bai-hoc/33-io-network-performance.md)

- **Cần nắm:** IOPS, bandwidth, latency, queue depth; buffered/direct I/O; TCP retransmission, backlog, socket buffer, MTU; kết nối ngắn/dài.
- **Thực hành:** Dùng `fio` trên file lab, `iperf3`, `tcpdump`; đo ở client, server và hệ điều hành.
- **Lưu ý:** Benchmark cần gần workload thực; không suy ra hiệu năng production từ một lần chạy hoặc chỉ throughput.

### Bài 34. Debugging, tracing và crash analysis

[Đọc bài 34 chi tiết](bai-hoc/34-debug-tracing-crash.md)

- **Cần nắm:** `strace`, `perf`, ftrace, eBPF ở mức ứng dụng; stack trace, symbol; core dump, GDB; kernel oops/panic, kdump nhập môn.
- **Thực hành:** Tìm hot path, phân tích crash, thu thập bằng chứng cho lỗi treo.
- **Lưu ý:** Tracing có chi phí, phụ thuộc quyền và kernel/configuration. Core dump có thể chứa dữ liệu nhạy cảm.

### Bài 35. Đồng thời, khóa và xử lý bất đồng bộ

[Đọc bài 35 chi tiết](bai-hoc/35-dong-thoi-va-khoa.md)

- **Cần nắm:** Race condition, deadlock, livelock; atomic, mutex, spinlock, semaphore, futex; memory ordering nhập môn; RCU; interrupt context, softirq, workqueue.
- **Thực hành:** Viết chương trình đa luồng có race rồi sửa; tái tạo deadlock và đọc stack thread.
- **Lưu ý:** `volatile` không thay cơ chế đồng bộ. Quy tắc ngủ/chờ trong kernel phụ thuộc context và loại khóa, đặc biệt khi dùng PREEMPT_RT.

<a id="chang-8"></a>
## Chặng 8 — Năng lực senior và chuyên môn hóa

**Mục tiêu:** Kết hợp cơ chế hệ điều hành với thiết kế, vận hành và xử lý sự cố toàn hệ thống.

### Bài 36. Container và cgroups

[Đọc bài 36 chi tiết](bai-hoc/36-container-cgroups.md)

- **Cần nắm:** Namespace, cgroups v2; capability, seccomp; root filesystem, overlay filesystem; runtime; CPU/memory/PID limit.
- **Thực hành:** Tạo namespace đơn giản, giới hạn tài nguyên; tìm nguyên nhân OOM hoặc CPU throttling.
- **Lưu ý:** Container dùng chung kernel host. CPU quota không đồng nghĩa với dành riêng core; container không phải VM thu nhỏ.

### Bài 37. Virtualization và thiết kế tài nguyên

[Đọc bài 37 chi tiết](bai-hoc/37-virtualization.md)

- **Cần nắm:** Hypervisor, KVM/QEMU; vCPU, overcommit, steal time; virtio, bridge/NAT; tài nguyên guest/host.
- **Thực hành:** So sánh workload trong guest với số liệu host; dựng lab nhiều máy mô phỏng hệ thống dịch vụ.
- **Lưu ý:** Guest chậm có thể do tranh chấp tài nguyên host; chỉ nhìn guest sẽ thiếu bằng chứng.

### Bài 38. Build kernel và Linux tối giản

[Đọc bài 38 chi tiết](bai-hoc/38-build-kernel.md)

- **Cần nắm:** Source tree, Kconfig, built-in/module; toolchain, cross-compilation; kernel image, module, initramfs, rootfs; BusyBox; Device Tree trên nền tảng phù hợp.
- **Thực hành:** Build và boot kernel trong QEMU; tạo rootfs tối giản có shell và init.
- **Lưu ý:** Giữ kernel hoạt động tốt để fallback. Build thành công chưa chứng minh boot được hoặc đủ driver tìm root filesystem.

### Bài 39. Thiết kế và xử lý sự cố mức senior

[Đọc bài 39 chi tiết](bai-hoc/39-senior-troubleshooting.md)

- **Cần nắm:** Capacity planning; dependency, failure domain; single point of failure; HA, consistency; rủi ro thay đổi; incident response, RCA, postmortem.
- **Thực hành:** Xử lý tình huống nhiều triệu chứng: latency tăng, đầy đĩa, DNS lỗi, restart liên tục; lập timeline và chứng minh nguyên nhân.
- **Lưu ý:** Tách giảm ảnh hưởng trước mắt khỏi sửa nguyên nhân gốc. Phân biệt điều đã chứng minh, giả thuyết và phần chưa biết.

### Bài 40. Đồ án tổng hợp và bảo vệ quyết định kỹ thuật

[Đọc bài 40 chi tiết](bai-hoc/40-do-an-tong-hop.md)

- **Cần nắm:** Kết hợp kiến trúc, vận hành, bảo mật, hiệu năng, phục hồi thành hệ thống tái tạo được.
- **Thực hành:** Dựng reverse proxy, ứng dụng, database trên nhiều VM; tự động hóa; thêm monitoring, backup, giới hạn tài nguyên và chính sách truy cập.
- **Đầu ra:** Sơ đồ kiến trúc, cấu hình trong Git, runbook, báo cáo benchmark, bằng chứng restore, postmortem từ sự cố chủ động tạo trong lab.
- **Lưu ý:** Bảo vệ lựa chọn bằng yêu cầu và kết quả đo, đồng thời trình bày trade-off, giới hạn và phương án rollback.

Các tình huống bắt buộc của đồ án:

| Tình huống | Năng lực cần thể hiện |
|---|---|
| Máy không boot sau thay đổi mount | Xác định giai đoạn lỗi và phục hồi |
| Service không start | Phân tích dependency, quyền, môi trường và log |
| CPU cao hoặc ứng dụng chậm dù CPU thấp | Phân biệt thực thi, hàng đợi, chờ I/O và chờ khóa |
| RAM tăng, tiến trình bị kill | Phân tích bộ nhớ, giới hạn cgroup và OOM |
| Đĩa đầy nhưng `du` không giải thích được | Kiểm tra mount, inode, file đã xóa còn mở |
| Client không kết nối được | Theo DNS → route → transport → TLS → ứng dụng |
| Máy hoặc dữ liệu bị mất | Restore trên máy mới, đối chiếu RPO/RTO |

<a id="danh-gia"></a>
## Các mốc đánh giá

| Mốc | Đầu ra kỳ vọng |
|---|---|
| Sau bài 5 | Giải thích kiến trúc, Linux/RTOS và dựng môi trường học |
| Sau bài 15 | Tự quản trị máy Linux cơ bản, service và lỗi boot thường gặp |
| Sau bài 25 | Giải thích quan hệ giữa tiến trình, kernel, mạng và storage |
| Sau bài 30 | Tự động hóa, bảo vệ, quan sát và khôi phục dịch vụ |
| Sau bài 35 | Tìm bottleneck, phân tích sự cố bằng số liệu và tracing |
| Sau bài 40 | Thiết kế, vận hành, phục hồi và bảo vệ quyết định kỹ thuật |

Checklist hoàn thành một bài:

- [ ] Giải thích được cơ chế mà không chỉ đọc lại câu lệnh.
- [ ] Tái tạo được bài lab từ ghi chép.
- [ ] Tìm được nguyên nhân của ít nhất một lỗi liên quan.
- [ ] Kiểm chứng kết quả sau khi sửa.
- [ ] Nêu được giới hạn, rủi ro và cách phục hồi của thao tác.

Hoàn thành giáo trình là nền tảng phát triển năng lực senior. Kinh nghiệm vận hành thực tế, chất lượng quyết định và khả năng xử lý tình huống mới vẫn là tiêu chí đánh giá quan trọng.

<a id="tai-lieu"></a>
## Tài liệu tham khảo

- [Linux Kernel Documentation](https://docs.kernel.org/): tài liệu subsystem, quản trị và phát triển kernel.
- [Linux scheduler documentation](https://www.kernel.org/doc/html/latest/scheduler/): CFS, EEVDF và các cơ chế lập lịch.
- [EEVDF Scheduler](https://kernel.org/doc/html/latest/scheduler/sched-eevdf.html): cơ chế lập lịch công bằng EEVDF.
- [Deadline Task Scheduling](https://kernel.org/doc/html/latest/scheduler/sched-deadline.html): EDF, CBS và SCHED_DEADLINE.
- [Zephyr Scheduling](https://docs.zephyrproject.org/latest/kernel/services/scheduling/index.html): một ví dụ cụ thể về lập lịch RTOS.
- [Debian Installation Guide](https://www.debian.org/releases/stable/amd64/index): yêu cầu phần cứng và cài đặt Debian amd64.
- Manual cục bộ: `man`, `help`, tài liệu package và release notes của distro đang dùng.

Ưu tiên tài liệu khớp phiên bản đang chạy; các đường dẫn `latest` và `stable` có thể thay đổi theo thời gian.
