# Bài 23 — Driver, module và đường đi I/O

[Mục lục](../README.md) · [← Bài 22](22-lvm-raid-backup.md) · [Bài 24 →](24-mang-linux.md)

## Mục tiêu: thiết bị hoạt động nhờ ai, và `write` xong nghĩa là gì?

Tình huống xuyên suốt: một chương trình ghi bản báo cáo, lời gọi ghi đã trả thành công nhưng bạn chưa biết nó dùng driver nào hay dữ liệu đã chịu được mất điện chưa. Bạn sẽ nối device với driver/module/firmware, đọc sysfs và udev không tháo driver, theo đường I/O với interrupt/DMA/queue, phân biệt buffered/direct/synchronous I/O, rồi quan sát flush/fsync trên file lab riêng. Cần kiến trúc bài 03, bộ nhớ bài 17 và storage bài 21–22.

**I/O**, input/output, là trao đổi dữ liệu vào/ra giữa chương trình và thành phần khác, như đọc ổ hoặc gửi mạng. **Process**, tiến trình, là một lần chạy chương trình có tài nguyên/bộ nhớ và mã số PID. **Kernel**, lõi hệ điều hành, quản lý process, bộ nhớ và thiết bị; **user space** là nơi chương trình ngoài kernel như Python chạy. **System call**, lời gọi hệ thống, là giao diện process yêu cầu kernel làm việc như đọc/ghi. Không phải mọi I/O chạm phần cứng ngay, vì dữ liệu có thể đi qua bộ nhớ đệm.

## 1. Driver là module hay firmware?

**Device**, thiết bị, là đối tượng kernel nhận diện/quản lý: có thể là card mạng, ổ NVMe, hoặc thiết bị logic/ảo. **Driver**, trình điều khiển, là mã nối thiết bị với các cơ chế kernel và giao tiếp theo loại thiết bị đó. **Subsystem**, nhóm cơ chế cho một loại chức năng, như networking hoặc block storage, cung cấp giao diện chung để driver tích hợp. Một ứng dụng đọc file không cần tự biết các thanh ghi của bộ điều khiển ổ.

**Built-in driver** được liên kết sẵn vào file kernel khi build nên có thể dùng không cần nạp file module riêng. **Loadable module** là phần mã có thể được nạp vào kernel đang chạy; file thường có đuôi `.ko` và có thể được nén. Một module có thể cung cấp driver, filesystem hoặc chức năng khác: “module” mô tả cách đóng gói/nạp, không đồng nghĩa tất cả module là driver thiết bị. `lsmod` liệt kê các module đã nạp, không liệt kê toàn bộ mã built-in.

**Firmware** trong ngữ cảnh thiết bị là mã/dữ liệu cần cho thiết bị hoạt động, có thể được driver yêu cầu từ user space rồi đưa vào thiết bị. Nó khác file module chạy trong kernel. Firmware nền tảng như UEFI ở bài 14 là một ngữ cảnh khác của cùng từ. Một card mạng có driver đã nạp nhưng thiếu firmware vẫn có thể không khởi tạo thành công; lỗi firmware có thể nằm trong log kernel, không chữa bằng chmod file thiết bị. Xem [kernel firmware introduction](https://docs.kernel.org/driver-api/firmware/introduction.html).

```text
Process → system call → subsystem kernel → driver → device
                                            │
                                            └→ có thể yêu cầu firmware
Driver được đưa vào kernel: built-in hoặc module
```

Đọc dòng đầu là đường điều khiển; nhánh firmware là một nhu cầu có điều kiện, không phải mọi thao tác đọc file nạp lại firmware. Dòng cuối mô tả cách mã driver có mặt, không phải hai driver phải chạy nối tiếp.

Ví dụ kiểm tra module `loop` nếu hệ có nó: `modinfo loop` đọc metadata file/module được công cụ tìm thấy cho kernel; `lsmod` mới giúp xem nó đang được nạp. **Metadata** là thông tin mô tả, như tác giả, license hoặc danh sách firmware cần; `modinfo -F firmware TEN_MODULE` có thể liệt kê tên firmware mà module khai báo, nhưng danh sách trống không bảo đảm thiết bị không cần firmware bằng cách khác. Có file đúng tên chưa chứng minh driver bind thành công vào thiết bị thật.

**Bind**, gắn driver với device, là quá trình chọn driver phù hợp rồi thử khởi tạo device. Bước **probe** là hàm/thao tác driver dùng để xác nhận và thiết lập thiết bị. Nếu probe lỗi, thiết bị có thể hiện trong danh sách bus mà chưa có driver hoạt động. **Bus** là lớp kết nối/nhóm thiết bị như PCI hoặc USB; không phải mọi bus đều là sợi dây ngoài máy, một số là mô hình nền tảng/ảo. Xem [driver binding](https://docs.kernel.org/driver-api/driver-model/binding.html).

## 2. `/sys` và `/dev` là hai cách nhìn khác nhau ra sao?

**sysfs** là filesystem ảo xuất cấu trúc đối tượng kernel ra cây `/sys`, như thiết bị, driver và bus. **Filesystem** là cách tổ chức tên/file/thư mục; filesystem ảo xuất trạng thái thay vì lưu các file độc lập trên SSD như ext4. Nhiều file sysfs là **attribute**, thuộc tính có thể đọc và đôi khi ghi để điều khiển trạng thái; đừng viết vào `/sys` chỉ vì trông giống file văn bản.

**Device node** là file đặc biệt trong `/dev` dùng để yêu cầu thao tác tới loại thiết bị; block node cho thiết bị theo khối, character node cho giao diện kiểu ký tự/luồng theo driver. `ls -l /dev/nvme0n1` có ký tự `b` và cặp **major/minor**, số loại/đối tượng giúp kernel tìm giao diện thiết bị. Node là điểm truy cập, không chứa toàn bộ driver hoặc firmware; số major/minor cũng không tự mô tả dữ liệu của thiết bị.

**udev** là thành phần user space nhận sự kiện thiết bị và áp quy tắc đặt thuộc tính, quyền, liên kết. Trên nhiều hệ, kernel/devtmpfs tạo node cơ bản, udev điều chỉnh và tạo các tên thuận tiện như `/dev/disk/by-uuid/...`. **Symlink**, liên kết tượng trưng, là tên chứa đường dẫn trỏ sang nơi khác; `ls -l` thấy `name -> target`, `readlink -f` lần theo tới đường dẫn chuẩn. Udev không phải driver đọc sector của ổ.

```text
Kernel phát hiện device và quan hệ bus/driver
  ├→ sysfs: /sys/devices/... và các đường trỏ /sys/class/...
  └→ sự kiện thiết bị → udev áp rules → quyền/tên/link /dev phù hợp
Process mở /dev/... → kernel dùng giao diện driver tương ứng
```

Mũi tên sang sysfs là xuất mô hình để quan sát; mũi tên sang udev là sự kiện/chính sách user space. **Rule** là quy tắc áp khi thuộc tính thiết bị khớp điều kiện. **Permission**, quyền truy cập, quyết định danh tính được đọc/ghi/thực thi theo cơ chế hệ thống; `ls -l /dev/...` cho chủ/nhóm và các bit. Chmod node thủ công có thể mất khi node được tạo lại; sửa bền vững cần rule/chính sách phù hợp, không mặc định mọi node nên `chmod 666`. Bài này chỉ đọc, không chỉnh udev rules.

Một thiết bị logic có thể nằm trên nhiều lớp dưới. Driver link của một partition không luôn ở cùng vị trí như whole disk; loop hoặc device mapper có thể không có `device/driver` đúng mẫu phổ biến. Thiếu link ở một đường cụ thể không chứng minh “không driver”; cần lần theo parent và hiểu loại device.

## 3. Khi gửi I/O, CPU có phải tự chép từng byte sang thiết bị?

**CPU** là bộ xử lý thực thi chỉ thị. **Buffer**, vùng đệm, là vùng bộ nhớ dành giữ dữ liệu trao đổi. **Descriptor** trong ngữ cảnh thiết bị là cấu trúc mô tả một yêu cầu/vùng đệm (địa chỉ, độ dài, cờ...), khác **file descriptor** là số nhận diện file mở của process. Driver chuẩn bị yêu cầu theo giao thức thiết bị rồi thông báo cho nó xử lý.

**DMA**, Direct Memory Access, là cơ chế thiết bị/bộ điều khiển chuyển dữ liệu với bộ nhớ mà CPU không phải thực hiện từng phép copy byte. CPU/driver vẫn cần chuẩn bị, đồng bộ và xử lý kết quả; DMA không có nghĩa CPU không liên quan. **Interrupt**, ngắt, là thông báo khiến CPU/kernel xử lý sự kiện, chẳng hạn một số yêu cầu đã hoàn tất. **Polling** là chủ động kiểm tra trạng thái; driver có thể kết hợp/ngắt theo lô tùy thiết kế, không luôn một interrupt cho từng block.

**Completion** là mốc một yêu cầu được báo hoàn tất theo giao thức đang xét. Hoàn tất DMA vào RAM, hoàn tất ghi vào cache thiết bị và hoàn tất ghi bền xuống phương tiện là các mốc khác nhau. RAM là bộ nhớ làm việc thường mất dữ liệu khi mất điện, không phải ổ lưu trữ bền.

```text
Driver chuẩn bị buffer + descriptor
  → chuyển quyền sử dụng vùng đệm theo giao thức
  → device nhận yêu cầu → DMA truyền dữ liệu nếu hỗ trợ
  → interrupt/polling nhận completion → driver kiểm tra kết quả
  → kernel cập nhật/trả kết quả cho lớp trên
```

**Ownership**, quyền sử dụng vùng đệm trong một giai đoạn, giúp tránh CPU/device cùng sửa dữ liệu trái giao thức. **Cache coherence**, sự nhất quán giữa các bản dữ liệu đệm, quyết định khi CPU và thiết bị thấy dữ liệu nhau; không phải mọi nền tảng có cùng cơ chế tự đồng bộ. **DMA address** là địa chỉ thiết bị sử dụng, có thể khác địa chỉ ảo CPU thấy. **IOMMU** là phần cứng/cơ chế ánh xạ và giới hạn truy cập DMA; driver không tự lấy một con trỏ user space rồi coi là địa chỉ device dùng được. Driver phải dùng API DMA, đồng bộ/mapping và giữ vùng đệm sống đủ lâu; giải phóng buffer khi thiết bị còn dùng có thể làm hỏng bộ nhớ.

Ví dụ đọc một block từ ổ: driver chuẩn bị vùng nhận, device DMA dữ liệu về RAM, completion xác nhận kết quả rồi kernel cho lớp trên dùng. **API**, giao diện lập trình, là tập hàm/quy tắc để lớp khác yêu cầu việc; ở đây API DMA xử lý khác biệt địa chỉ/cache của nền tảng. Phần này giải thích mô hình, không viết driver riêng; [DMA API HOWTO của kernel](https://docs.kernel.org/core-api/dma-api-howto.html) là nguồn cho các điều kiện thực tế. Không kết luận quan sát một dòng /proc/interrupts chứng minh toàn bộ đường dữ liệu của một yêu cầu cụ thể.

## 4. I/O scheduler có phải scheduler CPU trong bài 19–20?

**Scheduler**, bộ lập lịch, chọn/thứ tự công việc theo mục tiêu. Scheduler CPU chọn thread nào chạy trên CPU; **I/O scheduler** ở **block layer**, lớp kernel tổ chức yêu cầu tới thiết bị khối, sắp xếp/phân phối request storage. **Request** là yêu cầu I/O được block layer/driver tổ chức, không nhất thiết một-một với một `write` của ứng dụng. Gom/tách yêu cầu và cache làm hai lớp khác nhau.

**Queue**, hàng đợi, giữ các yêu cầu chưa xử lý xong. **Queue depth** là số yêu cầu có thể/đang nổi ở một mốc theo phép đo; tăng nó có thể nâng throughput nhưng cũng tăng chờ. **Throughput** là lượng dữ liệu/công việc hoàn tất mỗi đơn vị thời gian; **latency** là độ trễ của một thao tác. **NVMe** là giao thức storage thường dùng với SSD qua PCIe, hỗ trợ nhiều queue; **blk-mq** là cơ chế multi-queue block I/O của Linux phối hợp queue phần mềm/phần cứng. Một SSD nhiều queue không có cùng mô hình một ổ quay xử lý một tác vụ đơn.

Các lựa chọn thường gặp, chỉ dùng khi kernel/device hiện hỗ trợ:

| Lựa chọn | Mục tiêu/cơ chế chính | Không nên suy ra |
|---|---|---|
| `mq-deadline` | Sắp xếp và xét mốc chờ của request để quản lý độ trễ/phân phối | Không phải policy CPU `SCHED_DEADLINE`, không bảo đảm mọi I/O có deadline cứng |
| `bfq` | Budget Fair Queueing, phân phối dịch vụ I/O theo ngân sách/công bằng | Không bảo đảm tốt nhất cho mọi SSD/workload |
| `none` | Bỏ lớp scheduler bổ sung ở vị trí này | Không có nghĩa device không có queue hoặc firmware không tự sắp xếp |

**Workload** là mẫu công việc thực tế, như đọc tuần tự file lớn hoặc nhiều đọc nhỏ ngẫu nhiên. Scheduler phù hợp phụ thuộc loại device và workload. `/sys/class/block/TEN/queue/scheduler` có thể in `none [mq-deadline]`: ngoặc vuông đánh dấu đang chọn, các tên khác là lựa chọn hiện có ở đó. Danh sách có thể chỉ `[none]`, hoặc file không có ở partition/thiết bị đặc biệt; xem whole device phù hợp, không ghi một tên không có để ép dùng.

`iostat` (bộ sysstat) có `%util` biểu diễn phần thời gian theo accounting thiết bị có I/O, không phải “phần trăm công suất vật lý SSD đã dùng” chung cho mọi kiến trúc. Với nhiều yêu cầu song song, gần 100% chưa tự chứng minh throughput đã tối đa; queue/latency/tốc độ và workload phải đọc cùng nhau. Lab không đổi scheduler; trước khi đổi trên hệ thật cần baseline và benchmark có điều kiện, ghi lại scheduler cũ để phục hồi. Xem [blk-mq](https://docs.kernel.org/block/blk-mq.html), [BFQ](https://docs.kernel.org/block/bfq-iosched.html) và `man iostat` bản cài.

## 5. `write`, `flush`, `fsync`: mỗi lớp đang hứa điều gì?

**Buffered I/O** dùng bộ nhớ đệm; có thể có buffer của thư viện ứng dụng rồi **page cache**, bộ đệm nội dung file do kernel quản lý. Ví dụ `f.write(...)` của Python có thể còn ở buffer Python. `f.flush()` đẩy buffer ấy xuống tầng file/kernel, không đồng nghĩa ổ đã ghi bền. `write` thành công thông thường cho biết dữ liệu đã được tiếp nhận theo giao diện; với buffered write, nó có thể nằm ở cache RAM và được ghi xuống sau.

**Dirty page** là trang dữ liệu cache đã thay đổi nhưng chưa đồng bộ theo trạng thái kernel; **writeback** là quá trình đẩy những dữ liệu cần ghi xuống storage. **Durability**, độ bền, nghĩa dữ liệu tồn tại sau loại sự cố đã được hệ thống cam kết. Một completion write không đủ xác định durability nếu còn cache dễ mất ở lớp dưới.

**`fsync(fd)`** yêu cầu đồng bộ dữ liệu file và metadata cần thiết theo bảo đảm filesystem/thiết bị; **`fdatasync(fd)`** tập trung dữ liệu và metadata cần để đọc lại dữ liệu, không phải mọi thuộc tính không liên quan. `fd` là file descriptor, số xác định file mở trong process. Lỗi của các bước này phải được xử lý; không chỉ gọi rồi bỏ qua status/exception. Filesystem và thiết bị cần hỗ trợ đúng các yêu cầu flush/cache; phần cứng/firmware báo sai có thể làm hỏng kỳ vọng ứng dụng.

```text
Python f.write → buffer Python
Python f.flush → write system call → page cache kernel (buffered)
Python os.fsync → yêu cầu đồng bộ file → filesystem/block/driver/device
```

Mỗi dòng có mốc mạnh hơn nhưng không thay mốc ứng dụng: giao dịch nhiều file/database còn cần giao thức riêng. Một file mới hoặc rename tạo thay đổi **directory entry**, tên trong thư mục; fsync file không tự luôn làm entry thư mục bền. Quy trình cập nhật an toàn thường gồm ghi file tạm, fsync file, đổi tên theo điều kiện và fsync thư mục, đồng thời xử lý lỗi ở từng bước. **Rename** là đổi tên/đường dẫn qua cơ chế filesystem; tính nguyên tử việc nhìn tên không cùng nghĩa tính bền qua crash. Xem [fsync(2)](https://man7.org/linux/man-pages/man2/fsync.2.html).

**Direct I/O**, truy cập trực tiếp theo hỗ trợ filesystem, giảm/bỏ qua page cache của kernel cho phần dữ liệu. Cờ **`O_DIRECT`** khi mở file yêu cầu kiểu đó; địa chỉ buffer, độ dài và vị trí đọc/ghi có thể cần **alignment**, căn theo đơn vị mà kernel/filesystem/device yêu cầu. Không căn đúng có thể bị EINVAL (argument không hợp lệ), hoặc hành vi fallback tùy hỗ trợ. Không mặc định “direct luôn nhanh” hoặc “không qua bất kỳ cache nào”: ứng dụng và thiết bị vẫn có các lớp khác.

**`O_SYNC`** yêu cầu các phép ghi hoàn tất theo bảo đảm synchronized I/O đối với dữ liệu và metadata tương ứng; **`O_DSYNC`** có phạm vi dữ liệu/metadata cần thiết tương ứng. Chúng giải mục tiêu đồng bộ, khác mục tiêu cache của O_DIRECT. Có thể dùng direct cùng synchronous theo điều kiện, nhưng một cờ không thay ý nghĩa của cờ kia. Đọc [open(2)](https://man7.org/linux/man-pages/man2/open.2.html) và tài liệu filesystem của kernel đang chạy; lab chỉ quan sát buffered write + fsync, không giả tạo direct I/O bằng buffer không căn đúng.

## 6. Lab chỉ đọc: nối một device với sysfs và driver

### 6.1. Liệt kê, không chọn tên từ ví dụ

Cần Linux có sysfs, util-linux, udevadm và kmod nếu muốn modinfo; VM/container có thể không lộ device vật lý. Tất cả lệnh phần này đọc, không modprobe/rmmod/unbind.

```bash
uname -r
lsmod
lsblk -o NAME,TYPE,MODEL,TRAN,SIZE
ls /sys/class/block
ls /sys/class/net
```

`lsmod` có Module/Size/Used by: Size là kích thước thông tin module theo công cụ, Used by là tham chiếu/quan hệ sử dụng, không đo “phần trăm driver đang bận”. `lsblk` cho TYPE disk/part/lvm/...; MODEL và TRAN là model/kiểu vận chuyển khi biết được, có thể trống cho thiết bị ảo. `net` là nhóm interface mạng, thiết bị giao tiếp của hệ; tên như `lo` là loopback, không mặc định có card vật lý.

Chọn **whole block device** thật trong kết quả, ví dụ `vda` ở VM hoặc `nvme0n1` nếu thực tế thấy; không chọn partition `vda1` chỉ để khớp ví dụ. Gán tên không kèm `/dev/`, rồi kiểm tra tồn tại:

```bash
block_name='THAY_BANG_TEN_THUC_TE'
test -e "/sys/class/block/$block_name" && printf 'Device exists\n'
ls -l -- "/dev/$block_name"
udevadm info --query=all --name="/dev/$block_name"
readlink -f -- "/sys/class/block/$block_name"
if test -L "/sys/class/block/$block_name/device/driver"; then
    readlink -f -- "/sys/class/block/$block_name/device/driver"
else
    printf 'No driver symlink at this device path; inspect parents\n'
fi
cat -- "/sys/class/block/$block_name/queue/scheduler"
```

Chỉ tiếp tục nếu Device exists và node tương ứng đúng loại bạn chọn; không bỏ qua việc thay placeholder. `udevadm info` có các dòng như `P:` đường sysfs, `N:` tên node, `E:` thuộc tính môi trường (tên chính xác tùy phiên bản); chúng mô tả đối tượng, không xác nhận toàn bộ thiết bị khỏe. `readlink -f` của class cho đường canonical trong `/sys/devices/...`; driver symlink nếu có có thể về `/sys/bus/.../drivers/...`. Kiểm tra `test -L` trước vì `readlink -f` riêng lẻ có thể in đường canonical ngay cả khi thành phần cuối chưa tồn tại; một dòng đường dẫn chưa tự là bằng chứng driver link có thật. Output minh họa chỉ giúp hiểu cấu trúc, không có một đường driver cố định cho mọi ổ.

### 6.2. Nếu không có link driver hoặc module, kết luận thế nào?

```bash
udevadm info --attribute-walk --name="/dev/$block_name"
```

`--attribute-walk` đi từ thiết bị lên các parent, cho các thuộc tính/rules-match như KERNEL, SUBSYSTEM, DRIVER và nhóm ATTRS của parent. **Parent** là đối tượng cha trong cây device; block disk NVMe có thể cần xem controller ở phía trên để tìm driver PCI. Dòng driver rỗng tại con không làm mọi parent driver rỗng.

Nếu đã tìm được đường driver, kiểm tra link `module` bên trong driver path: đó có thể trỏ `/sys/module/TEN_MODULE`. Lấy đúng tên thấy rồi `modinfo TEN_MODULE`; so sánh với lsmod. Driver built-in có thể có thông tin module khác hoặc không có file .ko riêng; thiếu trong lsmod không chứng minh thiết bị không hoạt động. Một số thông tin module installed có thể thuộc kernel khác nếu gọi modinfo với tùy chọn khác; mặc định nó tìm theo kernel đang chạy, đọc `modinfo --help` khi cần đối chiếu.

`journalctl -b -k --no-pager` xem log kernel boot hiện tại; tìm theo tên thiết bị/driver và thời điểm cụ thể. Nếu dùng `dmesg`, quyền kernel có thể hạn chế; không có quyền đọc không nghĩa không có lỗi. Một dòng firmware missing hoặc probe failed cho hướng kiểm tra, phải giữ thông báo đầy đủ thay vì chỉ trích từ “failed”. Không tháo driver root disk/card mạng quản trị: `rmmod`, sysfs unbind hoặc nạp module không phù hợp có thể mất dữ liệu/kết nối hoặc làm kernel lỗi. Lab không cần làm các thao tác đó.

Bạn đạt khi có chuỗi tên node → sysfs canonical → parent/driver → module hoặc giải thích built-in/virtual có bằng chứng. Nếu môi trường không lộ đủ, ghi rõ phần không quan sát được thay vì dựng kết quả.

## 7. Lab file tạm: thấy `flush` và `fsync` là hai bước

Cần Python 3 và strace, công cụ ghi lại system call của process được chạy dưới nó. Trace thêm overhead và không phải benchmark độ trễ thiết bị. Dùng thư mục mới riêng trong home để không đè `/tmp/linux-io-lab.txt` cố định hoặc file của người khác. **Shell** là trình diễn giải lệnh; biến phải giữ cùng phiên, `mktemp -d` tạo thư mục mới.

```bash
io_lab=$(mktemp -d "$HOME/io-lab.XXXXXX")
cat > "$io_lab/sync_demo.py" <<'PY'
import os
import sys

path = sys.argv[1]
with open(path, "x", encoding="utf-8") as f:
    f.write("durability demo\n")
    f.flush()
    os.fsync(f.fileno())
print("file flush and fsync completed")
PY
strace -o "$io_lab/trace.txt" -e trace=openat,write,fsync,close \
    python3 "$io_lab/sync_demo.py" "$io_lab/data.txt"
cat -- "$io_lab/data.txt"
rg 'data.txt|write\(|fsync\(' "$io_lab/trace.txt"
```

Chạy từng bước và dừng khi lỗi. Mode `"x"` yêu cầu tạo file mới, từ chối nếu đã tồn tại; nếu chạy lại cùng thư mục, lỗi FileExistsError là kết quả đúng của điều kiện, tạo thư mục lab mới thay vì đổi sang mode ghi đè dữ liệu. Nếu không có rg, đọc trace trong trình soạn thảo. Python có thể mở nhiều file thư viện trước data.txt, nên không mặc định file descriptor luôn `3`.

Một trace **minh họa**, số descriptor/flag cụ thể có thể khác:

```text
openat(..., ".../data.txt", O_WRONLY|O_CREAT|O_EXCL|..., 0666) = 3
write(3, "durability demo\n", 16) = 16
fsync(3) = 0
close(3) = 0
```

Dòng open cấp fd `3`; write trả `16` nghĩa tiếp nhận 16 byte ở lời gọi đó; fsync `0` là thành công của yêu cầu đồng bộ file; close `0` đóng descriptor. Theo đúng fd của dòng data.txt để không nhầm `write(1, ...)` in thông báo vào stdout (luồng kết quả thường). Nếu write trả ít byte hơn yêu cầu, chương trình phải xử lý partial write; thư viện Python có quản lý một phần logic này, đây không phải mẫu C chỉ gọi write một lần rồi mặc định đủ.

`flush()` không xuất hiện dưới tên syscall flush: nó làm thư viện đẩy buffer, bạn thấy write; `os.fsync` mới thấy fsync. Nếu filesystem là tmpfs/overlay/mạng, bảo đảm phía dưới khác ext4 trên ổ vật lý; `findmnt -T "$io_lab" -o TARGET,SOURCE,FSTYPE,OPTIONS` giúp ghi phạm vi. File/trace đọc lại đúng và fsync thành công không chứng nhận phần cứng chống mất điện, không chứng minh DMA/interrupt cụ thể, không sync directory entry mới tạo và không tạo giao dịch nhiều file. Không thử rút điện để mở rộng lab này.

Khi xong, xóa riêng `data.txt`, `trace.txt`, `sync_demo.py` trong `$io_lab`, rồi `rmdir "$io_lab"`; đọc lại đường dẫn trước xóa. Không cần sudo, thay sysctl hay mount để chạy lab.

## 8. Lỗi thường gặp và kiểm tra theo lớp

| Hiện tượng | Cách kiểm tra | Kết luận cần tránh |
|---|---|---|
| Device hiện trên bus nhưng không dùng được | Driver binding/probe, firmware, log kernel | Đã có device nghĩa driver khởi tạo thành công |
| Module trên đĩa nhưng chưa thấy trong lsmod | Kernel đang chạy, built-in hay loadable, trạng thái nạp | File tồn tại nghĩa đang chạy |
| Không thấy driver ở đường sysfs mẫu | Loại device và parent qua attribute-walk | Kernel không có driver |
| Permission node đổi lại sau boot | Udev/devtmpfs/rules và chính sách | Chmod thủ công luôn bền |
| `[none]` ở scheduler | Queue/device và workload | Không có hàng đợi ở bất kỳ lớp nào |
| Write trả thành công, sau sự cố dữ liệu thiếu | Buffer, fsync, directory sync, lớp thiết bị và giao thức app | O_DIRECT hoặc journal tự bảo đảm mọi giao dịch |
| Trace có nhiều open/write | Theo fd/path của file lab | Dòng đầu tiên là I/O file cần đo |

Bảo đảm của ứng dụng kết thúc ở đâu phải nối với bảo đảm của filesystem, block layer, driver và thiết bị. Nếu muốn đo hiệu năng, bài 31–33 hướng dẫn workload và số đo; không đổi scheduler/kernel/module chỉ từ một cột `%util` hoặc một lần trace.

## 9. Tự kiểm tra và mô hình ghi nhớ

1. `lsmod` không có tên driver, thiết bị vẫn chạy: những khả năng nào? **Tiêu chí:** built-in, tên driver/module khác hoặc lớp ảo; xác minh sysfs/parent thay vì phỏng đoán.
2. Có module nhưng journal báo thiếu firmware: hai thành phần nằm ở đâu? **Tiêu chí:** module là mã kernel, firmware là mã/dữ liệu thiết bị cần; kiểm tra đúng yêu cầu và gói distro.
3. Tại sao udev không thay driver? **Tiêu chí:** udev xử lý sự kiện/chính sách user space, driver giao tiếp thiết bị trong kernel.
4. DMA có nghĩa CPU không làm gì? **Tiêu chí:** CPU/driver vẫn chuẩn bị descriptor, mapping, ownership và completion.
5. `none` có nghĩa không queue? **Tiêu chí:** chỉ bỏ scheduler bổ sung ở block layer đó; blk-mq/device vẫn có queue.
6. Python flush xong, có thể hứa tồn tại sau mất điện? **Tiêu chí:** chưa, buffer ứng dụng khác yêu cầu sync storage.
7. O_DIRECT khác O_SYNC ở mục tiêu nào? **Tiêu chí:** cache path khác bảo đảm đồng bộ; alignment/hỗ trợ còn cần xét.
8. File mới fsync xong nhưng directory chưa sync: điều gì chưa được cam kết trong quy trình? **Tiêu chí:** độ bền entry tên mới theo filesystem/giao thức; không lẫn atomic rename với durable.

Bạn đạt khi báo cáo một chuỗi device/sysfs/driver có giới hạn môi trường, đọc đúng các dòng write/fsync/close của fd file lab, và nói được phép thử quan sát API chứ chưa kiểm tra mất điện. Mô hình tự nhắc: device cần driver phù hợp; module là cách nạp mã, firmware là nhu cầu khác; dữ liệu đi qua nhiều buffer/queue; mỗi mốc hoàn tất chỉ hứa trong phạm vi lớp của nó. Bài 24 áp dụng cách nối lớp đó sang mạng và socket.

## Nguồn và phạm vi phiên bản

- [Driver model](https://docs.kernel.org/driver-api/driver-model/index.html), [binding](https://docs.kernel.org/driver-api/driver-model/binding.html), [firmware](https://docs.kernel.org/driver-api/firmware/introduction.html): thiết bị, driver và firmware.
- [DMA API HOWTO](https://docs.kernel.org/core-api/dma-api-howto.html): địa chỉ, ownership và đồng bộ theo nền tảng.
- [blk-mq](https://docs.kernel.org/block/blk-mq.html), [BFQ](https://docs.kernel.org/block/bfq-iosched.html): queue và scheduler I/O.
- [fsync(2)](https://man7.org/linux/man-pages/man2/fsync.2.html), [open(2)](https://man7.org/linux/man-pages/man2/open.2.html): đồng bộ, direct I/O và giới hạn.
- [udevadm](https://man7.org/linux/man-pages/man8/udevadm.8.html), [modinfo](https://man7.org/linux/man-pages/man8/modinfo.8.html): công cụ quan sát và ý nghĩa đầu ra.

Đối chiếu `uname -r`, `udevadm --version`, `strace --version`, `man udevadm`, `man modinfo`, `man open`, `man fsync` trên máy. Kernel/config/filesystem/device và môi trường VM/container có thể làm đường sysfs, scheduler khả dụng, alignment và bảo đảm khác nhau; các output minh họa không phải kết quả cố định cho mọi máy.
