# Bài 05 — Yêu cầu phần cứng, cài đặt và môi trường lab

[Mục lục](../README.md) · [← Bài 04](04-linux-va-rtos.md) · [Bài 06 →](06-terminal-va-shell.md)

## Mục tiêu và chuẩn bị

Hoàn thành bài 01–04. Chuẩn bị máy host có công cụ ảo hóa, ISO từ website chính thức và dung lượng trống. Mục tiêu là có VM có thể khôi phục để dùng xuyên suốt giáo trình.

Sau bài này, bạn cần tự giải thích host, guest, ISO, ổ ảo, snapshot và ba kiểu mạng lab; chọn cấu hình phù hợp máy mình; xác minh nguồn cài; cài một guest Debian/Ubuntu; kiểm tra boot, quyền, storage và mạng; rồi **thử khôi phục** snapshot. Bài học theo tình huống: tạo một VM CLI tên `linux-lab` trên máy cá nhân để học các bài tiếp theo. Các tên và dung lượng dưới đây chỉ là ví dụ, không phải kết quả đã quan sát trên máy của bạn.

**Host** là máy đang chạy công cụ ảo hóa. **Guest** là hệ điều hành chạy bên trong **máy ảo (VM)**. Hypervisor/công cụ ảo hóa cấp cho guest CPU, RAM, thiết bị và ổ đĩa ảo. **ISO** là image bộ cài gắn như đĩa quang ảo để boot installer; **ổ đĩa ảo** là nơi guest sẽ được cài lâu dài. Phân biệt hai thứ này giúp tránh cài nhầm lên ổ thật hoặc boot đi boot lại vào installer.

```text
Máy host (CPU, RAM, SSD thật)
  └─ Hypervisor / công cụ ảo hóa
       ├─ vCPU, RAM và card mạng ảo
       ├─ ISO: bộ cài, tháo sau khi cài
       └─ Ổ ảo: chứa hệ Linux guest và dữ liệu lab
```

Đọc sơ đồ từ trên xuống: host cấp tài nguyên, hypervisor trình bày chúng thành phần cứng ảo, guest chỉ thấy các thiết bị được cấp. File ổ ảo nằm trên host nhưng bên trong guest nó hiện như một ổ đĩa để phân vùng, format và boot. Snapshot lưu một trạng thái VM để quay lại; nó không biến VM thành một máy độc lập hay thay thế bản sao dữ liệu ở nơi khác.

## 1. Hiểu đúng yêu cầu phần cứng

Không có mức RAM hoặc dung lượng tối thiểu chung cho Linux. Cần tách hỗ trợ kiến trúc CPU của kernel, yêu cầu bộ cài/distro, driver thiết bị và workload ứng dụng. Một image cho ARM không chạy trực tiếp như binary x86-64; giả lập kiến trúc khác có thể cần QEMU emulation và chậm hơn nhiều.

Bốn câu hỏi cần tách riêng: (1) kernel hỗ trợ kiến trúc CPU nào, (2) **bộ cài** của distro hỗ trợ máy ảo/thiết bị nào, (3) guest có driver cho card mạng/ổ ảo được chọn không, và (4) ứng dụng dự định chạy cần bao nhiêu RAM/disk. Vì thế không thể lấy mức tối thiểu để *boot* làm mức đủ để build kernel hay chạy nhiều VM. [Hướng dẫn cài Debian theo kiến trúc amd64](https://www.debian.org/releases/stable/amd64/) có phần yêu cầu phần cứng riêng; cần mở đúng bản cho kiến trúc và release bạn tải.

**Kiến trúc CPU** là bộ lệnh mà phần mềm được biên dịch để chạy, ví dụ x86-64 hoặc ARM64. Máy x86-64 không thực thi trực tiếp image ARM64 như một guest cùng kiến trúc. QEMU có thể **giả lập** kiến trúc khác bằng phần mềm; tăng tốc ảo hóa như KVM áp dụng khi host/guest và nền tảng phù hợp. Hai đường này khác về khả năng và hiệu năng, theo [tài liệu QEMU](https://www.qemu.org/docs/master/system/introduction.html). Với lab đầu tiên, chọn image cùng kiến trúc với host và cấu hình hypervisor hỗ trợ để giảm biến số.

Với lab CLI, có thể bắt đầu bằng 2 vCPU, RAM 2–4 GB, disk 25–40 GB. Host RAM 16 GB và SSD trống khoảng 100 GB thuận tiện cho lab nhỏ; nhiều VM hoặc build kernel nên dự trù thêm. Đây là ngân sách học tập, không phải cam kết tối thiểu của distro.

**vCPU** là CPU ảo cấp cho guest, không phải một lõi vật lý dành riêng vĩnh viễn. RAM cấp cho VM làm host còn ít RAM hơn trong lúc chạy; số VM cùng bật phải tính gộp. Ổ ảo “40 GB” là dung lượng guest được phép sử dụng, còn file trên host có thể cấp phát động hoặc cấp trước tùy định dạng/cấu hình; snapshot làm mức dùng thật trên host tăng thêm. Tự kiểm tra bằng cách ghi RAM/disk trống của host trước khi tạo VM và so với tổng tài nguyên dự định cấp. Nếu host thiếu tài nguyên, chọn bản cài CLI nhẹ và chỉ bật một VM; không lấy swap lớn làm thay thế tương đương RAM.

Kiểm tra virtualization được hỗ trợ và bật trong firmware. Nested virtualization chỉ cần khi guest phải chạy hypervisor tiếp; không bật chỉ vì đang dùng một VM thông thường.

**Virtualization extension** là hỗ trợ ảo hóa của CPU và firmware; tên cài đặt có thể khác theo hãng và máy. Nếu hypervisor báo không dùng được tăng tốc, kiểm tra hướng dẫn của công cụ, firmware và các hypervisor đang dùng trên host. **Nested virtualization** là cho một guest chạy hypervisor/VM *bên trong*; các bài CLI đầu không cần nó. Ngay cả khi CPU có hỗ trợ, việc cài đặt và quyền của host vẫn quyết định tăng tốc có dùng được hay không. Đừng suy từ một dấu hiệu CPU đơn lẻ rằng VM đã chạy bằng tăng tốc.

### Vì sao dùng VM thay vì container cho bài này?

VM có kernel, quá trình boot, init và ổ ảo của guest. Container Linux thông thường dùng chung kernel của host, nên rất hữu ích để học user space nhưng không thay thế được lab cài kernel, bootloader, phân vùng hay cứu hộ hệ thống. Trong VM, `uname -r` kiểm tra kernel **guest đang chạy**; trong container nó phản ánh kernel host. Bài 36 sẽ học chi tiết container. Cách tự kiểm tra ở đây là xem cài đặt VM có một ổ ảo riêng và quan sát guest tự boot sau khi tháo ISO.

## 2. Quy trình cài đặt

1. **Chọn distro và nhánh hướng dẫn.** Bài lab mặc định dùng Debian/Ubuntu, Bash và systemd trên VM. Chọn release được nhà phát hành hỗ trợ và đọc hướng dẫn cài đúng **release + kiến trúc**; màn hình và tên package có thể đổi. [Debian Installation Guide](https://www.debian.org/releases/stable/amd64/) là ví dụ cho nhánh amd64.
2. **Tải và xác minh ISO.** Lấy ISO và file checksum/chữ ký từ trang nhà phát hành. Tính hash của ISO bằng `sha256sum ten-file.iso` trên host có lệnh này, đối chiếu với đúng dòng tên file trong danh sách chính thức. Hash khớp chứng tỏ file khớp danh sách đã lấy; để tin danh sách thuộc nhà phát hành cần kiểm tra chữ ký và dấu vân tay khóa theo quy trình của distro. [Ubuntu hướng dẫn cả xác minh chữ ký lẫn checksum](https://ubuntu.com/tutorials/how-to-verify-ubuntu); [Debian hướng dẫn kiểm tra image](https://www.debian.org/releases/stable/amd64/ch04s07.en.html). Lệnh, tên file và khóa phải lấy từ hướng dẫn hiện hành, không sao chép giá trị cũ ở ví dụ.
3. **Tạo VM và ổ ảo mới.** Chọn 2 vCPU, 2–4 GB RAM, 25–40 GB ổ ảo như điểm bắt đầu cho CLI nếu host đủ tài nguyên. Gắn ISO làm đĩa cài và chọn firmware BIOS/UEFI theo hỗ trợ của hypervisor và image; ghi lựa chọn. Kiểm tra màn hình gán storage: đích cài phải là **ổ ảo mới của VM**, không phải ổ vật lý hoặc thư mục host chứa dữ liệu quan trọng.
4. **Cài guest.** Boot ISO, chọn bản server/CLI nếu phù hợp, đặt hostname `linux-lab` (hoặc tên của bạn), tạo user thường và thiết lập quyền quản trị theo hướng dẫn distro. Ghi lại lựa chọn mạng, timezone, kiểu phân vùng và user; không ghi mật khẩu vào hồ sơ lab. Nếu installer có tùy chọn xóa toàn bộ disk, đọc lại tên và dung lượng ổ **trong VM** trước khi xác nhận.
5. **Boot từ ổ ảo.** Hoàn tất cài đặt, tháo ISO/đổi boot order, rồi reboot. Nếu vào màn hình đăng nhập của hệ đã cài và file trong home còn sau reboot, guest đã boot từ ổ ảo. Nếu lại vào installer, kiểm tra ISO và boot order trước khi cài lại.
6. **Cập nhật theo distro và tạo mốc.** Sau khi xác nhận mạng/repository, trên Debian/Ubuntu có thể chạy `sudo apt update` rồi `sudo apt upgrade` trong **VM lab**. `update` làm mới metadata; `upgrade` cài bản cập nhật theo chính sách APT hiện hành. Đọc danh sách thay đổi và thông báo cần reboot; nếu kernel được cài mới, `uname -r` chỉ đổi sang kernel mới sau khi boot phiên bản đó. Khi hệ ổn định, tắt guest sạch, tạo snapshot `baseline-clean` bằng giao diện hypervisor và thử restore theo lab bên dưới. [Hướng dẫn snapshot của VirtualBox](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html) là ví dụ cụ thể; giao diện khác có tên mục khác.

Snapshot lưu trạng thái ở thời điểm chụp nhưng không thay backup độc lập. Snapshot có RAM và snapshot chỉ có disk cũng khác nhau về cách khôi phục.

Snapshot thường lưu trạng thái ổ ảo và cấu hình VM; nếu chụp khi VM đang chạy, công cụ có thể lưu cả trạng thái RAM. Snapshot lúc guest tắt sạch dễ hiểu hơn cho mốc đầu: restore rồi boot lại. Khôi phục snapshot **bỏ các thay đổi phát sinh sau mốc** trong phạm vi snapshot. Snapshot có thể phụ thuộc vào chuỗi file và host đang chứa nó, nên không thay bản backup độc lập trên thiết bị/vị trí khác. [VirtualBox mô tả nội dung và hành vi restore](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html); với hypervisor khác phải đọc tài liệu tương ứng.

## 3. Mạng cho lab

NAT thường giúp VM truy cập Internet mà không mở trực tiếp toàn bộ service ra LAN. Host-only/internal network dùng cho giao tiếp lab. Bridged đưa VM vào mạng vật lý và cần hiểu DHCP, địa chỉ và quyền truy cập.

**Card mạng ảo** nối guest với một mạng do hypervisor cung cấp. Bảng sau mô tả cách dùng thường gặp; tính năng chi tiết tùy công cụ:

| Kiểu nối | Guest thường nói chuyện với ai? | Dùng khi nào và giới hạn |
|---|---|---|
| NAT | Ra ngoài qua host/hypervisor | Dùng để tải package ở lab đầu; máy ngoài thường không vào guest trực tiếp nếu chưa đặt port forwarding. |
| Host-only | Host và các VM cùng mạng host-only | Lab nhiều VM cần host truy cập, thường không tự có Internet qua chính card này. |
| Internal | Các VM cùng mạng nội bộ | Lab cô lập giữa VM; host thường không ở mạng này. |
| Bridged | Các máy trong mạng vật lý, tùy chính sách LAN | Guest như một máy trên LAN; phải hiểu cấp IP, firewall và quyền truy cập. |

Đọc theo cột giữa: “guest nhìn thấy ai” quyết định cách thử kết nối. Một VM có thể có nhiều card, ví dụ NAT để tải package và host-only để hai VM trao đổi. **NAT của VirtualBox** còn có biến thể NAT Network cho nhiều VM; NAT mặc định của từng VM không tự nối hai VM với nhau. Chi tiết xem [tài liệu mạng VirtualBox](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/networkingdetails.html). Không suy rằng guest có IP thì chắc có Internet: còn route, DNS và kết nối upstream.

Giai đoạn đầu dùng console VM. Chỉ bật SSH khi đến bài mạng và đã hiểu user, key, firewall. Console là đường cứu hộ khi cấu hình mạng sai.

**Console VM** là màn hình/bàn phím guest do hypervisor cung cấp, không phụ thuộc vào IP guest. Nếu cấu hình mạng sai, vẫn có thể đăng nhập ở console để sửa. **SSH** là đăng nhập qua mạng; cần mạng hoạt động, dịch vụ SSH đang chạy và chính sách truy cập phù hợp. Vì thế giữ console sẵn trong lúc học và chỉ thêm SSH khi có nhu cầu cụ thể.

## 4. Lab: kiểm tra sau cài đặt

```bash
cat /etc/os-release
uname -r
uname -m
id
sudo -v
findmnt /
df -h /
ip -br addr
ip route
ps -p 1 -o comm=
mkdir -p "$HOME/linux-lab"
```

Chạy các lệnh **bên trong guest sau khi boot từ ổ ảo**, bằng user vừa tạo. `sudo -v` có thể hỏi mật khẩu và lưu xác thực tạm thời; nó chỉ kiểm tra quyền sudo, chưa cập nhật gì. `mkdir -p` tạo thư mục thực hành trong home, không ghi đè file có sẵn. Nếu `findmnt` hoặc `ip` thiếu ở bản cài tối giản, tra package tương ứng trong tài liệu distro rồi ghi nhận lệnh chưa chạy, không bịa kết quả.

| Lệnh | Điều cần đọc | Giới hạn kết luận |
|---|---|---|
| `cat /etc/os-release` | `ID`, `VERSION_ID`: distro/release của user space | Không cho biết kernel đang chạy. |
| `uname -r`, `uname -m` | Kernel đang chạy và kiến trúc máy guest nhìn thấy | Không cho biết chính xác package kernel mới đã cài nhưng chưa boot. |
| `id`, `sudo -v` | UID/groups và việc user có xác thực sudo được không | Có lệnh `sudo` không đồng nghĩa user được phép dùng nó. |
| `findmnt /`, `df -h /` | Mount chứa `/`, nguồn filesystem; dung lượng/đã dùng/còn trống | Tên nguồn có thể là LVM hoặc thiết bị ảo; cần đối chiếu với cấu hình ổ VM, không suy từ `/dev/sda` ở mọi máy. |
| `ip -br addr`, `ip route` | Card, trạng thái, IP và route mặc định | Có IP/route không chứng minh DNS hay repository truy cập được. |
| `ps -p 1 -o comm=` | Tên tiến trình PID 1 | Với nhánh mặc định thường là `systemd`; hệ khác có thể dùng init khác. |

Ví dụ **minh họa, không phải đầu ra đã chạy**: `findmnt /` có thể hiện nguồn `/dev/vda1` và loại `ext4`; `ip -br addr` có thể hiện `enp0s3 UP 10.0.2.15/24`. Chữ `vda1` gợi ý một thiết bị block ảo; địa chỉ `10.0.2.15` là ví dụ hay gặp với NAT VirtualBox. Máy bạn có thể hiện tên/địa chỉ khác. Để xác nhận ổ đúng, so dung lượng `df -h /` và cấu hình storage của VM; để xác nhận Internet/repository, thử `sudo apt update` trên nhánh Debian/Ubuntu rồi đọc lỗi cụ thể nếu có. Nếu `apt update` thành công, chỉ kết luận guest kết nối được tới các repository đã cấu hình lúc đó, không kết luận mọi địa chỉ Internet đều hoạt động.

Lưu hồ sơ trong `~/linux-lab/machine.txt` bằng editor hoặc chuyển hướng sau bài 08: distro/release, kiến trúc, kernel, RAM/vCPU/ổ ảo được cấp, kiểu mạng, nguồn mount `/`, PID 1, tên snapshot và ngày tạo. Không ghi mật khẩu. Hồ sơ giúp so sánh khi một lệnh ở bài sau cho kết quả khác tài liệu.

Thử tạo file marker trong home, khôi phục snapshot và kiểm tra marker biến mất. Chỉ thử khi không có dữ liệu cần giữ sau snapshot.

Diễn tập theo đúng thứ tự để tự kiểm tra snapshot:

1. **Trước khi restore**, chắc rằng snapshot `baseline-clean` đã được tạo và ghi lại mọi thay đổi sau snapshot mà bạn muốn giữ ở nơi khác. Restore sẽ bỏ chúng trong VM.
2. Boot guest từ snapshot hiện tại, chạy `printf 'after snapshot\n' > "$HOME/linux-lab/restore-check.txt"`, rồi `cat "$HOME/linux-lab/restore-check.txt"`. Dòng `after snapshot` xác nhận file marker đã tồn tại **sau** mốc snapshot.
3. Tắt guest sạch. Trong giao diện hypervisor, chọn đúng VM và đúng snapshot `baseline-clean`, rồi restore. Một số công cụ hỏi có lưu trạng thái hiện tại trước khi restore hay không; đọc rõ lựa chọn vì nó ảnh hưởng khả năng quay lại thay đổi mới.
4. Boot guest và chạy `test ! -e "$HOME/linux-lab/restore-check.txt" && printf 'restore OK\n'`. Nếu in `restore OK`, marker đã biến mất như mong đợi. Nếu không in gì, kiểm tra exit status bằng `echo $?` và xem có chọn đúng snapshot/VM không. Marker biến mất chứng minh phần dữ liệu đó quay về mốc; nó **không** chứng minh snapshot là backup độc lập hoặc mọi dữ liệu ngoài VM cũng được phục hồi.

## 5. Lỗi thường gặp và kiểm tra đạt

- ISO còn gắn khiến VM quay lại bộ cài: kiểm tra boot order và tháo ISO.
- Guest thiếu mạng: xem card có gắn, loại NAT và địa chỉ IP; chưa vội sửa DNS.
- `sudo` không tồn tại hoặc user chưa có quyền: dùng console quản trị theo tài liệu distro để hoàn tất cài đặt.
- Host thiếu RAM: giảm số VM đang chạy; swap lớn không thay thế RAM về hiệu năng.
- Hash ISO không khớp: kiểm tra đã so đúng tên file và đúng release/kiến trúc; tải lại từ nguồn chính thức, không tiếp tục cài file chưa xác minh.
- `ip -br addr` có IP nhưng `apt update` lỗi: đọc lỗi DNS, route, mirror hoặc chứng chỉ; dùng `ip route` để xem đường mặc định, không kết luận ngay “mạng hỏng”.
- Restore snapshot xong mất thay đổi mới: đó là hành vi khôi phục về mốc; xuất dữ liệu cần giữ ra ngoài VM trước khi restore.

Đạt bài khi VM boot từ disk, user dùng sudo được, truy cập repository được và đã diễn tập restore snapshot. Giải thích được vì sao container không thay VM cho bài boot/kernel.

## Tự kiểm tra

1. ISO và ổ ảo khác nhau thế nào? **ISO là nguồn cài; ổ ảo là nơi hệ guest và dữ liệu tồn tại sau khi cài.**
2. `uname -r` vẫn hiện kernel cũ sau `apt upgrade` có nghĩa cập nhật thất bại không? **Chưa chắc; kernel mới có thể đã cài nhưng guest chưa boot vào nó.**
3. VM dùng NAT tải package được; máy khác trong LAN mặc nhiên SSH vào VM được không? **Không; NAT mặc định thường cần port forwarding hoặc kiểu mạng phù hợp.**
4. Vì sao phải thử restore thay vì chỉ thấy tên snapshot trong danh sách? **Vì mục tiêu là xác nhận có thể quay lại trạng thái cần dùng; tên snapshot đơn lẻ không chứng minh quy trình khôi phục.**
5. Container báo Debian và `uname -r` báo kernel host. Nên dùng nó để lab bootloader Debian không? **Không; container thường không boot kernel riêng.**

## Tóm tắt mô hình tư duy

```text
Chọn đúng image và tài nguyên → tạo VM với ổ ảo riêng
  → xác minh ISO → cài guest → boot từ ổ ảo
  → kiểm tra distro/kernel/quyền/storage/mạng
  → chụp và diễn tập khôi phục snapshot
```

Sơ đồ là thứ tự để tự nhắc lại: mỗi bước tạo bằng chứng cho bước sau. Snapshot chỉ có ích khi bạn biết **nó lưu mốc nào** và đã kiểm tra **có thể trở về mốc ấy**. Các lab tiếp theo mặc định dùng VM này; khi kết quả khác bài viết, mở hồ sơ máy và kiểm tra lại distro, release, kiến trúc, kernel và mạng trước.

## Đọc thêm

- [Debian Installation Guide](https://www.debian.org/releases/stable/amd64/) và [xác minh image Debian](https://www.debian.org/releases/stable/amd64/ch04s07.en.html): chọn bản đúng kiến trúc, kiểm tra bộ cài.
- [Ubuntu — xác minh ISO](https://ubuntu.com/tutorials/how-to-verify-ubuntu): phân biệt checksum với chữ ký.
- [QEMU — system emulation](https://www.qemu.org/docs/master/system/introduction.html): guest, kiến trúc và tăng tốc.
- [VirtualBox — mạng ảo](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/networkingdetails.html) và [snapshot](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html): ví dụ cụ thể; nếu dùng hypervisor khác, đọc tài liệu phiên bản đang cài.
