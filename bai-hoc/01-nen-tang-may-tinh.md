# Bài 01 — Nền tảng máy tính và hệ điều hành

[Mục lục](../README.md) · [Bài 02 →](02-linux-va-distro.md)

## Mục tiêu và chuẩn bị

Không yêu cầu kiến thức Linux trước đó. Sau bài này, bạn phải giải thích được CPU thực thi chương trình, bộ nhớ giữ dữ liệu và hệ điều hành chia sẻ tài nguyên như thế nào. Phần lệnh có thể thực hiện sau khi cài VM ở bài 05.

Hãy giữ một ví dụ xuyên suốt: bạn chạy chương trình đọc một file rồi in nội dung ra màn hình. CPU thực thi lệnh của chương trình; RAM chứa lệnh và dữ liệu đang dùng; kernel giúp chương trình tìm file, truy cập thiết bị và chia CPU với các chương trình khác.

## 1. Từ chương trình đến CPU

Chương trình trên đĩa là dữ liệu. Khi chạy, hệ điều hành tạo tiến trình và thiết lập không gian địa chỉ để CPU lấy lệnh, giải mã rồi thực thi. Thanh ghi giữ trạng thái đang xử lý: vị trí lệnh, toán hạng, con trỏ stack. CPU không trực tiếp hiểu Python hoặc Bash; interpreter của chúng là chương trình mã máy đang thực thi.

**Chương trình** là mã và dữ liệu được lưu trong file; **tiến trình** là một lần chương trình đang chạy, có không gian địa chỉ và tài nguyên do hệ điều hành quản lý. Một chương trình có thể có nhiều tiến trình. **Thread** là luồng thực thi bên trong tiến trình: các thread chia sẻ nhiều tài nguyên của tiến trình nhưng mỗi thread có trạng thái thực thi và stack riêng.

Ví dụ, với `cat hello.txt`, shell yêu cầu khởi chạy `cat`; CPU thực thi mã máy của `cat`. Khi `cat` cần mở và đọc file rồi ghi ra terminal, nó gọi **system call** để kernel xử lý phần cần quyền truy cập tài nguyên. Python interpreter cũng là một chương trình mã máy: nó đọc và thực hiện ý nghĩa mã Python, chứ CPU không tự hiểu cú pháp Python. Mã và dữ liệu được ánh xạ vào không gian địa chỉ; các trang cần thiết có thể được nạp theo nhu cầu, không phải toàn bộ chương trình luôn nằm trong cache.

### Diễn giải từng bước: chạy `cat hello.txt`

1. Shell đọc dòng lệnh bạn nhập. Nó phân tích `cat` là tên chương trình và `hello.txt` là đối số. Shell tìm file thực thi tương ứng với `cat` theo `PATH`.
2. Shell yêu cầu kernel tạo một tiến trình con và chạy chương trình `cat`. Kernel chuẩn bị không gian địa chỉ ảo, ánh xạ mã chương trình và thư viện cần thiết, tạo stack ban đầu rồi đặt trạng thái để CPU bắt đầu thực thi.
3. CPU thực thi các lệnh máy của `cat`. Khi cần dữ liệu, CPU tìm trong thanh ghi và cache; nếu không có, nó lấy từ tầng thấp hơn. Nếu trang bộ nhớ cần dùng chưa có trong RAM, có thể xảy ra **page fault** để kernel xử lý. Page fault không mặc nhiên là lỗi chương trình; nó có thể là một phần bình thường của cơ chế nạp trang theo nhu cầu.
4. `cat` yêu cầu kernel mở và đọc file. Dữ liệu có thể đã nằm trong page cache của RAM, hoặc kernel phải nhờ tầng filesystem và driver lấy từ thiết bị lưu trữ.
5. Sau khi nhận dữ liệu, `cat` yêu cầu ghi ra terminal và kết thúc. Kernel thu hồi tài nguyên của tiến trình; shell tiếp tục nhận lệnh mới.

Đường đi thực tế có thể khác ở từng hệ thống: thư viện thường bọc system call, file có thể được đọc thành nhiều lần, và CPU có thể tạm dừng `cat` để chạy thread khác. Điều quan trọng là phân biệt **lệnh máy CPU thực thi** với **dịch vụ kernel cung cấp**.

Một socket CPU có thể chứa nhiều core. Một core có thể cung cấp nhiều hardware thread nhờ SMT, nhưng các thread đó vẫn chia sẻ một số tài nguyên thực thi. Vì thế 8 logical CPU không mặc nhiên bằng 8 core vật lý. Trong VM, vCPU còn phải được hypervisor lập lịch lên tài nguyên host.

Ví dụ **1 socket × 4 core/socket × 2 thread/core = 8 logical CPU**. Một thread phần mềm thường chỉ thực thi trên một logical CPU tại mỗi thời điểm; thêm logical CPU không tự làm phần việc tuần tự nhanh gấp đôi. Trong VM, thông tin topology mà `lscpu` thấy là cấu hình được trình bày cho guest, không nhất thiết là topology vật lý của host.

**Lập lịch CPU** nghĩa là kernel chọn thread nào được chạy trên logical CPU nào. Nếu số thread sẵn sàng chạy nhiều hơn số logical CPU, chúng phải thay phiên. Khi đổi từ thread này sang thread khác, hệ thống phải lưu và khôi phục trạng thái thực thi; đó là một phần của **context switch**. Vì việc chuyển đổi có chi phí, tạo thật nhiều thread không tự động làm chương trình nhanh hơn. Ngược lại, nếu một thread đang chờ đọc dữ liệu, CPU có thể chạy thread khác trong thời gian chờ.

Ví dụ một phép tính gồm 80% công việc tuần tự và 20% có thể chia đều cho nhiều core. Dù có thêm rất nhiều core, phần 80% tuần tự vẫn phải chạy; vì vậy tổng thời gian không thể giảm tuyến tính theo số core. Đây là cách tự kiểm tra một lời quảng cáo kiểu “8 logical CPU nên chương trình nhanh gấp 8 lần”.

## 2. Thứ bậc bộ nhớ

```text
Register → cache L1/L2/L3 → RAM → SSD/HDD
  thường nhanh, nhỏ             thường chậm hơn, lớn hơn
```

Cache giữ bản sao dữ liệu để giảm thời gian chờ RAM. Nếu CPU phải chờ RAM, chưa thể kết luận ổ đĩa chậm: RAM và storage là các tầng khác nhau.

Cache tận dụng hai kiểu **locality**: theo thời gian (vừa dùng một giá trị thì có thể dùng lại sớm) và theo không gian (vừa dùng một địa chỉ thì có thể dùng tiếp địa chỉ gần đó). Bởi vậy, duyệt mảng liên tiếp thường thuận lợi cho cache hơn lần theo con trỏ rải rác. Đây là xu hướng, không phải bảo đảm cho mọi workload. RAM và storage trao đổi dữ liệu qua bộ điều khiển và bus; ổ đĩa 1 TB không làm máy có thêm 1 TB RAM. Swap có thể dùng storage hỗ trợ khi thiếu RAM nhưng thường chậm hơn RAM vật lý.

Hãy tưởng tượng bạn đọc một cuốn sách: thông tin đang nhớ trong đầu giống dữ liệu rất gần CPU; trang sách đang mở giống cache; sách trên bàn giống RAM; sách cất trong tủ giống storage. Ví dụ này chỉ giúp hình dung **chi phí lấy dữ liệu**: cấu trúc phần cứng thật phức tạp hơn và dữ liệu không nhất thiết đi qua từng tầng theo đúng một hàng thẳng.

**Latency** là thời gian chờ một lần truy cập hoặc một yêu cầu hoàn tất. **Throughput** là tổng lượng công việc hoàn thành trong một khoảng thời gian. Một thiết bị có thể xử lý rất nhiều yêu cầu cùng lúc nhưng từng yêu cầu vẫn phải chờ lâu. Khi phân tích hiệu năng, hãy hỏi rõ đang đo thời gian của *một yêu cầu* hay số yêu cầu *mỗi giây*.

RAM lưu trạng thái đang hoạt động và thường mất dữ liệu khi mất điện. Storage giữ dữ liệu lâu dài, nhưng ghi vào bộ đệm RAM chưa đồng nghĩa dữ liệu đã bền vững trên thiết bị. Bài 23 sẽ giải thích writeback và `fsync`.

Linux còn dùng RAM làm **page cache** cho dữ liệu file. Lần đầu đọc một file có thể cần truy cập thiết bị; lần sau đọc cùng nội dung có thể được phục vụ từ RAM. Vì cache có thể được thu hồi khi ứng dụng cần bộ nhớ, `free` báo nhiều RAM `used` không tự nó chứng minh máy thiếu RAM. Cần nhìn thêm `available`, hoạt động swap và tình trạng ứng dụng.

## 3. Interrupt, timer và DMA

Interrupt cho phép thiết bị báo sự kiện để CPU xử lý, thay vì CPU luôn hỏi thiết bị đã xong chưa. Một số đường I/O vẫn dùng polling tùy thiết bị và tải công việc. Timer tạo cơ sở để hệ điều hành theo dõi thời gian, đánh thức tác vụ và đánh giá việc chuyển task; một sự kiện timer không đồng nghĩa chắc chắn có chuyển tiến trình ngay lúc đó. DMA cho phép thiết bị truyền dữ liệu với bộ nhớ mà CPU không phải sao chép từng byte; CPU và driver vẫn thiết lập buffer, đồng bộ khi cần và xử lý hoàn tất.

Hệ điều hành cung cấp ba chức năng cốt lõi: trừu tượng hóa thiết bị, phân phối tài nguyên và cách ly hoạt động. Tiến trình nhìn thấy file thay cho chi tiết sector, không gian địa chỉ riêng thay cho toàn bộ RAM vật lý.

- **Trừu tượng hóa:** ứng dụng làm việc với file và socket thay vì tự điều khiển sector đĩa hoặc thanh ghi thiết bị.
- **Phân phối tài nguyên:** scheduler chọn thread chạy trên CPU; kernel quản lý RAM và yêu cầu I/O của nhiều tiến trình.
- **Cách ly và kiểm soát:** mỗi tiến trình có không gian địa chỉ ảo riêng; quyền truy cập và ranh giới user/kernel giới hạn tác động của chương trình lên chương trình khác. Địa chỉ ảo không phải địa chỉ RAM vật lý mà ứng dụng trực tiếp quản lý.

### Nối các khái niệm bằng một lần đọc file

```text
cat hello.txt
  → shell khởi chạy tiến trình cat
  → CPU chạy mã cat; dữ liệu cần dùng nằm trong cache/RAM
  → cat gọi kernel để mở và đọc file
  → kernel/filesystem/driver lấy dữ liệu từ page cache hoặc thiết bị
  → thiết bị có thể dùng DMA và báo hoàn tất
  → kernel trả dữ liệu; cat yêu cầu ghi ra terminal
```

Nếu file đã nằm trong page cache, lần đọc có thể không cần truy cập ổ đĩa. Nếu tiến trình đang chờ I/O, scheduler có thể cho thread khác chạy. Vì thế cần phân biệt **CPU đang xử lý** với **tiến trình đang chờ**.

## 4. Lab: lập hồ sơ máy

Trong terminal Linux, chạy các lệnh chỉ đọc:

```bash
lscpu
free -h
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
findmnt -no SOURCE,TARGET /
cat /proc/cpuinfo | head -n 25
cat /proc/meminfo | head
```

Ghi số socket, core/socket, thread/core, logical CPU; tổng RAM; nguồn của filesystem gắn tại `/`. Nếu trường topology không xuất hiện trong VM, ghi rõ giới hạn quan sát thay vì suy ra cấu hình host. `lsblk` cũ có thể dùng `MOUNTPOINT` thay `MOUNTPOINTS`; môi trường tối giản thiếu `findmnt` có thể xem `/proc/mounts`.

Đọc `free -h` ở hai cột `total` và `available`. `available` ước lượng bộ nhớ có thể cấp cho ứng dụng mới mà không phải swap mạnh; `used` cao chưa đủ chứng minh máy sắp hết RAM vì Linux còn dùng RAM làm cache. Dùng `findmnt` xác định nguồn của `/`, rồi `lsblk` lần theo disk → partition → filesystem → mountpoint. Nguồn `/` có thể là LVM, thiết bị mã hóa hoặc thiết bị ảo; trong container có thể không thấy storage host.

| Mục trong hồ sơ | Giá trị cần ghi | Nguồn |
|---|---|---|
| Môi trường | Máy vật lý, VM hay container; chỉ ghi điều biết chắc | Quan sát thực tế |
| Socket / core mỗi socket / thread mỗi core | Số quan sát được hoặc “không rõ” | `lscpu` |
| Logical CPU | Số CPU mà hệ điều hành nhìn thấy | `lscpu` |
| RAM tổng / available | Dung lượng và đơn vị | `free -h` |
| Nguồn của `/` | Thiết bị hoặc lớp lưu trữ được báo | `findmnt`, `lsblk` |

Đầu ra cần nộp là sơ đồ máy cùng bảng cấu hình. Giải thích vì sao dung lượng đĩa không cộng vào RAM và vì sao tăng logical CPU không đảm bảo ứng dụng nhanh tuyến tính.

## 5. Mẹo và lỗi thường gặp

- Phân biệt MB (1.000.000 byte) với MiB (1.048.576 byte) khi so sánh số liệu; công cụ có thể dùng hệ đơn vị khác nhau.
- Latency là thời gian một yêu cầu mất để hoàn tất; throughput là lượng công việc hoàn thành trong một khoảng thời gian.
- Phần trăm CPU phụ thuộc công cụ: một tiến trình đa luồng có thể vượt 100% khi 100% tương ứng một logical CPU.
- Tăng throughput không luôn giảm latency của từng yêu cầu; phải đọc đúng phép đo và tải thử nghiệm.
- Dữ liệu ứng dụng đã ghi chưa chắc đã bền trên đĩa vì có thể còn ở buffer của ứng dụng, kernel hoặc thiết bị.

## 6. Tự kiểm tra

1. CPU chờ RAM có nghĩa là ổ đĩa chậm không? **Không; đó là các tầng khác nhau.**
2. Vì sao DMA vẫn cần driver? **Driver cấu hình giao dịch và xử lý đồng bộ/hoàn tất.**
3. Một chương trình chỉ dùng một thread có tận dụng toàn bộ 8 core không? **Không tự động; cần phần việc song song và phần mềm hỗ trợ.**
4. Máy báo 8 logical CPU từ 4 core có nghĩa hiệu năng gấp đôi 4 core không? **Không; SMT chia sẻ tài nguyên, kết quả phụ thuộc workload.**
5. `free` báo RAM `used` cao có chắc máy sắp hết RAM không? **Không; cần xem `available`, cache và dấu hiệu thiếu bộ nhớ.**
6. Khi `cat` đọc file đã có trong page cache, có bắt buộc đọc SSD lần nữa không? **Không; kernel có thể trả dữ liệu từ RAM.**

## Đọc thêm

Tra `man lscpu`, `man free`, `man lsblk`, `man findmnt`; xem định nghĩa trường trong manual trước khi diễn giải số liệu.
