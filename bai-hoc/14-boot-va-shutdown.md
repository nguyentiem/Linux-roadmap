# Bài 14 — Toàn bộ quá trình boot và shutdown

[Mục lục](../README.md) · [← Bài 13](13-shell-scripting.md) · [Bài 15 →](15-systemd-va-cuu-ho.md)

## Mục tiêu: máy đi từ nút nguồn đến màn hình đăng nhập bằng cách nào?

Tình huống xuyên suốt: một máy Linux sau khi bật nguồn có lúc không tìm thấy ổ khởi động, có lúc vào màn hình cứu hộ, có lúc đăng nhập được nhưng ứng dụng không chạy. Những hiện tượng này xảy ra ở các lớp khác nhau; thay đổi nhầm lớp có thể làm mất thêm bằng chứng. Sau bài này, bạn cần vẽ được đường khởi động, phân biệt firmware/bootloader/kernel/initramfs/PID 1, lấy bằng chứng về root và thời gian khởi động, khoanh vùng lỗi và giải thích vì sao tắt có trật tự khác rút điện.

Kiến thức nền là kiến trúc bài 03, máy ảo bài 05 và process bài 12. **Máy ảo**, hay VM, là máy tính được mô phỏng/quản lý bởi phần mềm trên máy thật; nó có ổ và firmware riêng. Lab đọc dữ liệu trên hệ đang chạy; phần quan sát lần boot tiếp theo chỉ dành cho VM lab có console và bản chụp khôi phục, không cần thực hiện để hoàn tất phần đọc bằng chứng.

## 1. Trước khi có Linux, thành phần nào đang chạy?

**Boot**, tức khởi động, là chuỗi bước đưa máy từ trạng thái mới bật/reset đến hệ điều hành và ứng dụng dùng được. **Reset** đưa CPU về trạng thái bắt đầu theo thiết kế phần cứng; CPU là bộ xử lý chạy các chỉ thị chương trình. Lúc này chưa có shell để gõ `ls`, chưa có dịch vụ Linux.

**Firmware** là phần mềm nền được lưu trên thiết bị, có nhiệm vụ khởi tạo phần cứng đủ để chọn và nạp chương trình khởi động. Ví dụ menu “Boot order” của máy thuộc firmware, không phải menu của kernel Linux. **BIOS** là cơ chế firmware truyền thống phổ biến trên PC cũ; **UEFI** là giao diện firmware hiện đại, có khả năng nạp chương trình EFI từ file trên một phân vùng phù hợp. Chúng là hai đường khởi động, không phải hai distro Linux.

**Phân vùng**, hay partition, là vùng logic chia từ một thiết bị lưu trữ; một ổ có thể có phân vùng dành cho hệ thống và một phân vùng dành cho dữ liệu. **Filesystem**, hệ thống tổ chức file, quy định cách lưu tên, thư mục và nội dung trên vùng đó, như FAT hoặc ext4. **EFI System Partition (ESP)** là phân vùng chứa chương trình khởi động EFI, thường dùng định dạng FAT được firmware hỗ trợ. Nó có thể được Linux gắn vào `/boot/efi` hoặc nơi khác; ESP và thư mục `/boot` không luôn là cùng một nơi.

**Mount**, hay gắn hệ thống file, là thao tác đưa nội dung một filesystem vào một vị trí trong cây thư mục Linux. Vị trí đó gọi là **mount point**, ví dụ `/boot/efi`; sau mount, đọc đường dẫn ấy truy cập nội dung ESP. `findmnt /boot/efi` giúp kiểm tra vị trí này nếu máy dùng cách bố trí đó; không có kết quả chưa chứng minh máy không dùng UEFI, vì ESP có thể không đang được mount hoặc được mount ở vị trí khác.

Ví dụ mô hình trên PC:

```text
BIOS → mã khởi động trên thiết bị → bootloader
UEFI → chọn mục boot → đọc chương trình .efi trên ESP
```

Đọc từng dòng theo chiều mũi tên: firmware chọn đầu vào và chuyển điều khiển cho chương trình tiếp theo. Đây là hai nhánh minh họa, không phải mọi kiến trúc đều đi qua mã BIOS hoặc ESP. Thiết bị embedded có thể dùng firmware/bootloader như U-Boot với quy trình khác; không áp dụng sơ đồ PC để kết luận router hỏng ESP.

Nếu firmware báo “No bootable device”, Linux có thể chưa được nạp. Điểm kiểm tra là thiết bị được firmware nhận hay không, thứ tự boot và mục boot trỏ đâu; log của một service Linux không giải thích được lỗi trước khi Linux tồn tại.

## 2. Ai chọn kernel và nói cho nó biết root ở đâu?

**Bootloader** là chương trình chuẩn bị rồi nạp hệ điều hành, ví dụ GRUB có menu chọn một kernel cũ khi kernel mới có vấn đề. **Process**, tiến trình, là một lần chạy chương trình có bộ nhớ/tài nguyên và PID, mã số nhận diện. **Kernel** là phần lõi quản lý bộ nhớ, process, thiết bị và truy cập dữ liệu. File kernel trên ổ là sản phẩm được nạp; kernel đang chạy trong RAM có thể là bản cũ nếu vừa cập nhật mà chưa khởi động lại. RAM là bộ nhớ làm việc, thường mất dữ liệu khi mất điện. `uname -r` cho biết phiên bản kernel đang chạy; danh sách file trong `/boot` chỉ cho biết các file hiện có, không xác nhận file nào đã nạp.

**Kernel command line** là chuỗi tham số chuyển cho kernel khi khởi động, như nơi tìm hệ thống file gốc và cách ghi thông báo. **Root filesystem**, hệ thống file gốc, là nơi cung cấp cây thư mục bắt đầu ở `/`; ví dụ `/etc` và `/usr` được truy cập từ cây này. “Root” ở đây nói về gốc cây thư mục, khác tài khoản quản trị cũng tên root. `cat /proc/cmdline` đọc tham số của lần boot hiện tại, `findmnt /` đọc filesystem gốc hiện tại. `/proc` là cây file ảo do kernel xuất thông tin trạng thái, không phải tập file văn bản bền vững trên ổ.

Một command line **minh họa**:

```text
BOOT_IMAGE=/boot/vmlinuz-example root=UUID=1111-2222 ro quiet
```

`root=` chỉ nơi tìm root; **UUID** là mã nhận diện được lưu cho filesystem/thiết bị tùy lớp, giúp bớt phụ thuộc tên `/dev/sda` thay đổi theo thứ tự phát hiện. `lsblk -f` liệt kê các thiết bị dạng khối và thông tin filesystem; đối chiếu cột UUID với tham số hoặc cấu hình. `ro` yêu cầu root ban đầu theo chế độ chỉ đọc trong các đường boot hỗ trợ; hệ thống có thể chuyển sang đọc/ghi sau đó. `quiet` giảm thông báo. `BOOT_IMAGE` có thể do bootloader thêm, không phải bằng chứng tuyệt đối về file đang có trên ổ. Một số tham số được kernel hiểu, một số được chương trình đầu kỳ đọc; phải tra tài liệu của thành phần nhận tham số.

GRUB thường nạp cả kernel và file hỗ trợ khởi động ban đầu. Nhưng **EFI stub** là phần mã trong kernel cho phép firmware UEFI xem kernel như chương trình EFI; đường này có thể chạy mà không có GRUB tách biệt. **Unified Kernel Image (UKI)** là một ảnh EFI gộp kernel cùng các thành phần/thông tin khởi động như initramfs và command line theo định dạng được hỗ trợ. Vì vậy không thấy file initramfs riêng hoặc GRUB không đủ để kết luận máy thiếu thành phần boot. Xem [kernel EFI stub](https://docs.kernel.org/admin-guide/efi-stub.html) và [định dạng UKI của UAPI Group](https://uapi-group.org/specifications/specs/unified_kernel_image/).

**Secure Boot** là cơ chế kiểm tra chữ ký các thành phần được phép chạy trong chuỗi khởi động, dựa vào khóa/chính sách tin cậy. Chữ ký giúp kiểm tra nguồn và tính toàn vẹn; **mã hóa ổ đĩa** biến dữ liệu lưu thành dạng cần khóa để đọc. Secure Boot không làm nội dung ổ tự được mã hóa, cũng không chứng minh cấu hình ứng dụng an toàn. Cách triển khai shim, bootloader và kernel được ký tùy distro; xem [giải thích Secure Boot của Ubuntu](https://documentation.ubuntu.com/security/docs/security-features/platform-protections/secure-boot/) trước khi thay chính sách firmware.

## 3. Vì sao có kernel rồi mà vẫn cần initramfs?

Kernel khởi tạo các bộ phận quản lý bộ nhớ, nhận ngắt và phân chia thời gian xử lý. **Interrupt**, hay ngắt, là cơ chế thiết bị hoặc bộ định thời báo CPU cần xử lý sự kiện; ví dụ thiết bị hoàn tất đọc dữ liệu. **Scheduler**, bộ lập lịch, chọn công việc nào được chạy trên CPU. **Driver**, trình điều khiển thiết bị, là mã giúp kernel làm việc với loại phần cứng cụ thể, ví dụ bộ điều khiển ổ lưu trữ.

Một driver có thể được **built-in**, tức gắn sẵn vào file kernel, hoặc **module**, tức phần mã có thể nạp bổ sung vào kernel đang chạy. `lsmod` liệt kê module đã nạp, không liệt kê mọi driver built-in. Để đọc root trên ổ, kernel cần cả driver đường tới ổ và hỗ trợ filesystem của root. Nhưng nếu driver cần nạp lại nằm trong `/lib/modules` trên chính root chưa đọc được, sẽ có vòng phụ thuộc: muốn đọc ổ cần driver, muốn lấy driver lại phải đọc ổ.

**Initramfs** là tập file đóng gói để kernel giải ra một hệ thống file ban đầu trong RAM. Nó thường có chương trình `/init` và những công cụ/driver cần thiết để tìm rồi chuẩn bị root thật. **Early user space**, không gian chương trình chạy sớm ngoài kernel, là giai đoạn các chương trình đó xử lý chính sách và chuẩn bị môi trường trước khi hệ thống chính sẵn sàng. Không gian chương trình ngoài kernel gọi là **user space**: ví dụ `/init` là process dùng các dịch vụ kernel, không phải driver chạy trong kernel.

Trước sơ đồ, **exec** nghĩa là thay chương trình trong một process bằng chương trình khác mà giữ PID, mã số nhận diện process.

```text
Kernel + initramfs trong RAM
       │ chạy /init
       ▼
Tìm thiết bị → nạp module cần thiết → chuẩn bị vùng chứa root
       │ root có thể đọc được
       ▼
Mount root thật → chuyển gốc cây thư mục → exec init thật
```

Mũi tên đầu là chuyển từ kernel sang chương trình `/init`; hàng giữa là các việc phụ thuộc môi trường, không phải luôn có đủ mọi bước. Ví dụ root không mã hóa trên ext4 có thể chỉ cần tìm ổ và mount; root mã hóa phải mở khóa trước. **LUKS** là định dạng quản lý mã hóa thiết bị Linux; **RAID** phối hợp nhiều thiết bị thành lớp lưu trữ; **LVM** quản lý vùng lưu trữ logic trên thiết bị. Ở đây chỉ cần hiểu chúng thêm lớp giữa ổ vật lý và filesystem: root không nhất thiết nằm trực tiếp trên một partition đơn. `lsblk -f` giúp thấy cây thiết bị, nhưng không giải thích hết chính sách mở khóa/ghép thiết bị.

`exec` thay chương trình đang chạy trong một process bằng chương trình khác; **PID** là số nhận diện process. Kernel thường chạy `/init` ở PID 1, rồi early user space chuyển root và exec chương trình init của hệ thống chính. PID có thể vẫn là `1`, không cần “tạo PID 1 thứ hai”. **Init** là chương trình đầu tiên tổ chức phần còn lại của user space; trên nhiều distro hiện nay đó là systemd, trên hệ khác có thể là OpenRC hoặc BusyBox init.

Một cấu hình có đường tới root đơn giản, driver và filesystem cần thiết built-in có thể boot không cần archive initramfs bên ngoài. Điều đó không có nghĩa mọi hệ Linux bỏ được initramfs. Thuật ngữ **initrd** vốn chỉ cơ chế ảnh đĩa RAM đời cũ; tên file `initrd.img` hoặc option `-initrd` của công cụ vẫn có thể đang mang một archive initramfs. Tên không đủ xác định định dạng. Xem [tài liệu kernel về ramfs, rootfs và initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html); tài liệu chứa cả bối cảnh lịch sử, không lấy các kích thước/phiên bản cũ làm số đo hiện tại.

Tình huống áp dụng: kernel đã in thông báo nhưng báo không tìm được root. Bạn kiểm tra `root=`, UUID, driver và nội dung initramfs; việc firmware đã chuyển được tới kernel là bằng chứng để thu hẹp phạm vi. Root được mount thành công rồi ứng dụng lỗi thì không quay lại thay GRUB ngay.

## 4. Có root rồi, ai chạy dịch vụ và mở màn hình đăng nhập?

**Service**, dịch vụ, là công việc được tổ chức và quản lý để cung cấp chức năng, như server web hoặc thu thập log. **systemd** là hệ thống init/quản lý dịch vụ phổ biến; `systemctl` là công cụ gửi yêu cầu đến nó. Có file `/usr/bin/systemctl` chỉ xác nhận công cụ đã cài; `ps -p 1 -o pid,comm,args` mới giúp nhận diện chương trình đang giữ PID 1. Container, môi trường cô lập các chương trình trên kernel của máy chủ, có thể để ứng dụng làm PID 1 và không có systemd quản lý hệ thống.

systemd dùng **unit**, đối tượng cấu hình quản lý một thành phần như service hoặc filesystem mount. **Dependency** là quan hệ phụ thuộc giữa unit; **target** là unit nhóm những thành phần theo một mục tiêu vận hành, không phải một process dài hạn. `default.target` chọn mục tiêu mặc định, thường trỏ tới `multi-user.target` hoặc `graphical.target`. Multi-user phục vụ môi trường nhiều người dùng và dịch vụ thông thường không yêu cầu desktop; graphical thêm lớp đăng nhập/hiển thị đồ họa. Không suy ra “multi-user nghĩa là không có mạng” hoặc “graphical đã tới nghĩa là mọi ứng dụng khỏe”.

```text
Reset → firmware → chương trình EFI/bootloader → kernel
  → early user space nếu cần → root thật → init/PID 1
  → các unit theo phụ thuộc, nhiều việc song song → login/ứng dụng
```

Đọc từ trên xuống: mỗi lớp cung cấp điều kiện để lớp sau hoạt động. Ở dòng cuối, song song nghĩa là không có một danh sách tuyến tính duy nhất “service A rồi B rồi C” cho cả hệ thống. Bài 15 sẽ tách quan hệ kéo unit vào công việc với thứ tự chạy. Hệ không dùng systemd vẫn cần tổ chức user space nhưng không áp dụng các lệnh systemctl/target bên dưới.

## 5. Shutdown giải quyết việc gì trước khi cắt nguồn?

**Shutdown** là quy trình đưa hệ thống xuống có tổ chức; **reboot** là khởi động lại; **poweroff** là tắt nguồn theo khả năng phần cứng. Trong một lần tắt thông thường, trình quản lý hệ thống dừng dịch vụ, cho chương trình kết thúc, xử lý process còn lại, đồng bộ dữ liệu và gỡ các filesystem, rồi phối hợp với kernel để reset/tắt máy. **Signal**, tín hiệu, là thông báo gửi tới process như SIGTERM yêu cầu kết thúc; ứng dụng có thể xử lý để đóng dữ liệu. Khi vượt thời hạn, một số dịch vụ có thể bị kết thúc cưỡng bức theo cấu hình.

**Unmount** là gỡ filesystem khỏi vị trí gắn để không còn dùng qua mount point đó. Hệ thống cần ngừng người dùng dữ liệu trước khi gỡ để tránh ghi mới khi đang đóng. **Sync**, đồng bộ dữ liệu ghi, đẩy phần dữ liệu còn chờ từ bộ nhớ xuống lớp lưu trữ theo cơ chế hệ thống. Nó không sửa một ứng dụng đã ghi nội dung sai và không thể tự hoàn tất mọi giao dịch nghiệp vụ.

**Journaling** là cơ chế filesystem ghi nhật ký một số thay đổi để có thể khôi phục trạng thái cấu trúc sau sự cố. Nó giúp tránh những bất nhất nhất định, phạm vi bảo vệ dữ liệu phụ thuộc filesystem và chế độ. **Commit** là mốc ứng dụng/cơ sở dữ liệu xác nhận giao dịch hoàn tất theo giao thức của nó. Filesystem có journal không bảo đảm giao dịch ứng dụng chưa commit sẽ được giữ. Rút điện bỏ qua cơ hội ứng dụng đóng dữ liệu và hệ thống đồng bộ.

Ví dụ bạn đang lưu file nhưng chưa hoàn tất: shutdown có thể cho ứng dụng thời gian đóng/lưu nếu ứng dụng hỗ trợ, còn rút điện không cho bước đó. Không thử gây mất điện với dữ liệu quan trọng để “kiểm chứng journal”. Lab này chỉ đọc log; khi cần tắt VM, dùng chức năng shutdown đúng cách của VM/hệ khách. Các lệnh `systemctl reboot` và `systemctl poweroff` có tác động thật lên máy đang gọi; không cần chạy chúng để đọc hiểu bài.

## 6. Lab: dựng timeline từ bằng chứng chỉ đọc

### 6.1. Xác định môi trường trước khi suy luận

**Timeline** là dòng thời gian ghép các sự kiện với mốc xảy ra. Mục tiêu là lập bảng “giai đoạn → bằng chứng → kết luận → điều chưa biết”, không đo tốc độ bằng cảm giác. Trên Linux có công cụ procps/util-linux; các phần systemd chỉ dùng khi PID 1 là systemd và có quyền đọc cần thiết:

```bash
cat /etc/os-release
uname -r
ps -p 1 -o pid,comm,args
systemd-detect-virt
if test -d /sys/firmware/efi; then
    printf 'EFI information exposed\n'
else
    printf 'EFI information not exposed here\n'
fi
```

`/etc/os-release` mô tả distro user space. `ps` cho cột `PID`, `COMMAND` (tên ngắn) và `COMMAND`/args (dòng gọi đầy đủ), ví dụ minh họa `1 systemd /sbin/init`. `systemd-detect-virt` có thể in `kvm`, `docker`, `wsl` hoặc `none`; dùng thêm bối cảnh máy để hiểu môi trường, không xem một phép dò là mô tả toàn bộ hạ tầng. `/sys` là cây thông tin về kernel/thiết bị; trong VM hoặc container nó có thể bị ẩn/giới hạn. Có `/sys/firmware/efi` là bằng chứng kernel cung cấp thông tin EFI, không có nó chưa đủ kết luận mọi máy vật lý bên ngoài đang dùng BIOS.

### 6.2. Nối tham số boot với root đang dùng

```bash
cat /proc/cmdline
findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS /
lsblk -f
ls -lh /boot
```

Cách đọc đầu ra minh họa của `findmnt`:

```text
TARGET SOURCE    FSTYPE OPTIONS
/      /dev/vda2 ext4   rw,relatime
```

`TARGET=/` là gốc cây hiện tại; `SOURCE` là nguồn lưu trữ; `FSTYPE` là loại filesystem; `rw` trong `OPTIONS` là có thể đọc/ghi. `relatime` là một chính sách cập nhật thời gian truy cập, không phải chế độ boot. Nếu SOURCE là `overlay` trong container, đang thấy lớp filesystem của container; không suy ra ổ root vật lý host là overlay. Tên thiết bị và option máy bạn có thể khác.

Ở `lsblk -f`, xem tên/cây thiết bị, `FSTYPE`, `UUID`, `MOUNTPOINTS`; đối chiếu UUID với `root=` nếu có. LVM/mã hóa có thể thêm lớp nên không buộc một dòng cmdline phải khớp trực tiếp tên partition. `ls -lh /boot` cho tên/kích thước/thời gian file kernel và initramfs hiện có; nó không chứng minh file hiện tại đã được nạp ở lần boot trước. `/boot` có thể trống/không được đưa vào container hoặc dùng bố trí UKI, hãy ghi giới hạn thay vì phán lỗi.

### 6.3. Đọc thời gian và đường phụ thuộc của systemd

```bash
systemd-analyze time
systemd-analyze critical-chain
systemctl get-default
systemctl --failed --no-pager
journalctl -b -k -n 60 --no-pager
```

**Journal** là hệ thống bản ghi sự kiện có cấu trúc; `journalctl` truy vấn nó. `-b` chọn lần boot hiện tại; `-k` chọn thông báo kernel; `-n 60` lấy 60 mục gần nhất trong bộ lọc này. Nếu cần các thông báo đầu tiên, dùng `journalctl -b -k --no-pager` rồi đọc từ đầu trong trình cuộn hoặc ghi ra file lab, không mặc định 60 dòng cuối là giai đoạn khởi động sớm. Dòng có timestamp và thông báo thiết bị được nhận hoặc root mount thành công là bằng chứng; log thiếu có thể do quyền/retention, không chứng minh sự kiện không xảy ra. Có thể dùng `sudo journalctl ...` chỉ khi cần quyền đọc log hệ thống.

Ví dụ **minh họa**, không phải số đo máy của bạn:

```text
Startup finished in 3s (kernel) + 5s (userspace) = 8s
multi-user.target @5s
└─example.service @3s +2s
```

Ở dòng time, số hạng tương ứng giai đoạn có dữ liệu, không mặc định bao gồm toàn bộ thời gian từ bấm nút nguồn đến desktop phản hồi. Thời gian firmware/loader/initrd có thể có hoặc thiếu tùy bootloader và bản systemd. Dòng critical-chain có `@` là mốc unit bắt đầu/đạt mốc theo cách báo của công cụ và `+` là thời gian kích hoạt unit; các lớp lùi vào biểu diễn đường phụ thuộc được chọn. Nó không cho toàn bộ hoạt động song song, có thể không phản ánh việc ứng dụng tự khởi tạo sau khi unit được coi active. `systemd-analyze blame` xếp thời gian kích hoạt unit nhưng không chứng minh unit đầu danh sách gây boot chậm; các việc có thể chạy đồng thời. Đọc [systemd-analyze](https://www.man7.org/linux/man-pages/man1/systemd-analyze.1.html) cùng `man systemd-analyze` của bản trên máy.

`get-default` cho target mặc định được cấu hình, không phải kiểm tra mọi service. `--failed` chỉ liệt kê unit đang giữ trạng thái failed; bảng rỗng không chứng minh ứng dụng trả kết quả đúng. Nếu công cụ báo “System has not been booted with systemd”, quay lại kiểm tra PID 1 và môi trường thay vì cài thêm systemctl rồi gọi lại.

### 6.4. Ghi báo cáo có giới hạn, không đoán phần không thấy

| Giai đoạn | Bằng chứng cần ghi | Kết luận hợp lệ | Điều chưa thể kết luận |
|---|---|---|---|
| Firmware | `/sys/firmware/efi`, bối cảnh VM/máy thật | Có thông tin EFI được lộ ra nếu thư mục tồn tại | Chính xác toàn bộ boot order/chính sách firmware |
| Kernel | `uname -r`, cmdline, log kernel | Kernel đang chạy và tham số lần hiện tại | File cài trên đĩa hiện nay có giống lúc nạp không |
| Root | `findmnt /`, `lsblk -f` | Filesystem gốc và lớp thiết bị nhìn thấy | Mọi bước early user space đã làm nếu log thiếu |
| PID 1 | `ps -p 1 ...` | Chương trình init trong môi trường hiện tại | Init của host khi bạn đang trong container |
| Dịch vụ | Target, failed units, journal | Trạng thái unit và thông báo ghi nhận | Sức khỏe ứng dụng chưa thực hiện phép thử chức năng |

Bạn đạt lab khi điền được ít nhất kernel, root và PID 1 bằng dữ liệu thật, ghi “không có dữ liệu” cho phần thiếu, và tách output minh họa khỏi output máy mình.

### 6.5. Tùy chọn: thấy log boot trong VM dùng GRUB

Chỉ làm với VM lab có **snapshot**, bản chụp trạng thái dùng để quay lại, và **console**, màn hình/bàn phím trực tiếp của VM để không phụ thuộc SSH. SSH là kết nối đăng nhập từ xa qua mạng; khi mạng chưa chạy thì SSH không giúp quan sát boot sớm.

Trong menu GRUB, chọn mục boot và dùng phím chỉnh tạm thường là `e`. Tìm dòng nạp kernel (`linux`/`linuxefi` tùy cấu hình), bỏ riêng `quiet` nếu có; giữ nguyên `root=`, các tham số khác và dòng initrd. Theo chỉ dẫn dưới menu để boot mục chỉnh tạm (thường Ctrl+X hoặc F10). Thay đổi này chỉ cho lần boot ấy nếu bạn không ghi file cấu hình; lần tiếp theo chọn mục mặc định sẽ về cấu hình cũ. Nếu menu hoặc phím khác, tra bản GRUB/distro của VM, xem [GNU GRUB: sửa mục menu](https://www.gnu.org/software/grub/manual/grub/html_node/Menu-entry-editor.html).

Quan sát thông báo theo thứ tự, chụp lại mốc kernel nhận thiết bị và chuyển sang user space. Bỏ quiet không làm mọi log luôn xuất hiện trên màn hình: console, mức log và Plymouth (chương trình hiển thị màn hình chờ) ảnh hưởng cách trình bày. Không sửa `/etc/default/grub`, không chạy cập nhật GRUB để làm phần tùy chọn này.

## 7. Khi boot lỗi, bắt đầu ở tầng nào?

**Emergency mode**, chế độ khẩn cấp, là môi trường tối thiểu để sửa lỗi nghiêm trọng trong quá trình chuẩn bị hệ thống; **rescue mode** thường khởi động thêm các thành phần cơ bản để sửa chữa. Cấu hình và việc yêu cầu mật khẩu phụ thuộc distro. Đây khác một shell do initramfs mở khi chưa có root thật.

| Triệu chứng | Lớp đã có bằng chứng hoạt động | Bước kiểm tra trước |
|---|---|---|
| Firmware không tìm được thiết bị boot | Chưa chứng minh kernel chạy | Thiết bị, boot order, mục EFI/bootloader, ESP |
| Kernel panic hoặc không mount được root | Firmware/chương trình nạp đã đi tới kernel | Command line, UUID, driver, initramfs và lớp mã hóa/LVM |
| Có root nhưng vào emergency | Đường tới root ít nhất đã hoạt động ở mức nào đó | Journal, cấu hình mount phụ, unit lỗi |
| Có login nhưng server không trả lời | Phần user space đã lên tới login | Service, quyền, cấu hình, cổng và phép thử ứng dụng |

**Kernel panic** là tình trạng kernel gặp lỗi không thể tiếp tục an toàn theo cơ chế hiện tại; đọc thông báo cuối và bối cảnh, không suy ra mọi panic là ổ hỏng. **`fstab`** là file `/etc/fstab` khai báo các filesystem cần gắn cùng lựa chọn; một entry sai cho ổ phụ có thể ngăn đạt target bình thường dù root hoàn toàn đọc được. Bài 15 hướng dẫn đọc journal và kiểm tra cấu hình trước sửa.

Lỗi suy luận thường gặp: thấy lỗi service rồi cài lại GRUB; không có timing firmware rồi khẳng định không có firmware; thấy initrd trong tên file rồi khẳng định dùng cơ chế ramdisk cũ; nhìn `/boot` và cho rằng kernel mới đang chạy; xem journal và bỏ qua việc đang trong container. Hãy hỏi “phép đo này phản ánh lớp nào và phần nào chưa quan sát được?” trước mỗi kết luận.

## 8. Tự kiểm tra và ghi nhớ

1. Máy báo không có thiết bị boot. `systemctl restart ...` có xử lý được tại thời điểm đó không? **Tiêu chí:** chưa có Linux để thực thi; kiểm tra firmware và nguồn khởi động.
2. Kernel mới được cài vào `/boot`, `uname -r` vẫn bản cũ. Có mâu thuẫn không? **Tiêu chí:** phân biệt file đã cài với kernel đang chạy, cần lần boot phù hợp để đổi.
3. Vì sao initramfs có thể giải quyết vòng phụ thuộc driver/root? **Tiêu chí:** công cụ và driver cần thiết có sẵn trong RAM trước khi đọc root.
4. `/init` exec systemd thì PID 1 có cần đổi không? **Tiêu chí:** exec thay chương trình trong process, không tự cấp PID mới.
5. `blame` cho unit A 8 giây, B 7 giây. Có phải boot mất ít nhất 15 giây? **Tiêu chí:** không, có thể song song; cần đường phụ thuộc và định nghĩa mốc timing.
6. Filesystem có journal, vậy rút điện có bảo toàn giao dịch chưa commit? **Tiêu chí:** phân biệt khôi phục cấu trúc filesystem với bảo đảm của ứng dụng.
7. Container không có `/sys/firmware/efi`; host dùng BIOS chăng? **Tiêu chí:** chưa đủ dữ liệu, cây thông tin có thể bị ẩn.

Mô hình tự nhắc: firmware tìm đường nạp → kernel quản lý tài nguyên → early user space chuẩn bị root nếu cần → init tổ chức dịch vụ → người dùng dùng ứng dụng. Khi tắt, hệ thống cho ứng dụng và lưu trữ cơ hội đóng có trật tự trước khi kernel yêu cầu reset/tắt nguồn. Bài 15 đi sâu vào lớp init/dịch vụ, nơi nhiều lỗi “máy không lên đúng” thực ra bắt đầu.

## Nguồn và phạm vi phiên bản

- [systemd bootup](https://www.man7.org/linux/man-pages/man7/bootup.7.html): sơ đồ target/boot/shutdown từ tài liệu upstream systemd được man7 xuất bản.
- [Kernel command line trong systemd](https://www.man7.org/linux/man-pages/man7/kernel-command-line.7.html) và [tham số kernel](https://docs.kernel.org/admin-guide/kernel-parameters.html): phân biệt thành phần xử lý tham số.
- [Kernel initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html), [EFI stub](https://docs.kernel.org/admin-guide/efi-stub.html): cơ chế kernel/early user space.
- Tài liệu trực tuyến có thể mới hơn bản cài. Đọc `man bootup`, `man systemd-analyze`, `man kernel-command-line` và ghi `systemd --version` trước khi đối chiếu option/timing. Không cần reboot/shutdown để hoàn thành lab chỉ đọc.
