# Bài 17 — Quản lý bộ nhớ và page fault

[Mục lục](../README.md) · [← Bài 16](16-system-call.md) · [Bài 18 →](18-ly-thuyet-lap-lich.md)

## Mục tiêu: trả lời “chương trình đang dùng bao nhiêu bộ nhớ?” cho đúng

Một chương trình xin vùng 16 MiB nhưng lúc đầu số RAM ghi nhận chỉ tăng rất ít. Sau khi ghi vào từng trang, RAM mới tăng rõ. Máy có ít RAM trống nhưng vẫn mở được ứng dụng. Ngược lại, chương trình trong container có thể bị dừng vì thiếu bộ nhớ dù máy thật còn RAM. Những hiện tượng này không mâu thuẫn: chúng đang nói về các lớp bộ nhớ khác nhau.

Sau bài này, bạn cần phân biệt địa chỉ ảo với RAM đang hiện diện; giải thích trang, dịch địa chỉ và page fault; nhận biết stack, heap, cấp phát theo nhu cầu và copy-on-write; đọc VSZ/RSS/PSS cùng `free`/`vmstat`; hiểu cache, reclaim, swap và giới hạn bộ nhớ. Lab chỉ xin một vùng nhỏ, không cố gây thiếu RAM hoặc đổi cấu hình máy.

Nên đã học bài 01, 12 và 16. Mô hình chính áp dụng Linux có phần cứng hỗ trợ bộ nhớ ảo; thiết bị embedded không có MMU có giới hạn khác. Các lệnh lab dùng Linux, Bash, Python 3 và công cụ procps thường có trên distro desktop/server. Các số cụ thể bên dưới là **minh họa** trừ đoạn ghi rõ quan sát đã chạy; số thực phải đọc trên máy của bạn.

## 1. Một địa chỉ trong chương trình có phải vị trí thật trên thanh RAM?

**Process — tiến trình** là một lần chương trình đang chạy, có tài nguyên và bộ nhớ do Linux quản lý. **PID** là số nhận dạng process, dùng để chọn đúng chương trình khi quan sát; Python có thể in bằng `os.getpid()`. **Kernel — nhân hệ điều hành** là phần lõi phân phối tài nguyên và kiểm tra quyền truy cập; Python/C của bạn chạy trong **user space — không gian ứng dụng**, không tự quản lý toàn bộ RAM.

**RAM — bộ nhớ truy cập ngẫu nhiên** là bộ nhớ vật lý làm việc của máy, nhanh hơn lưu trữ thông thường và không giữ dữ liệu sau mất điện. **Địa chỉ ảo** là vị trí mà chương trình dùng khi đọc/ghi bộ nhớ; **không gian địa chỉ ảo** là tập các khoảng địa chỉ mà process có thể có. Nó tạo một góc nhìn riêng, giúp chương trình không phải biết dữ liệu đang nằm ở vị trí RAM nào.

**Địa chỉ vật lý** xác định vị trí trong không gian bộ nhớ mà phần cứng truy cập. Một địa chỉ ảo không đơn giản là cùng con số ấy trên RAM. Hai process có cùng giá trị con trỏ có thể trỏ đến dữ liệu khác; một vùng địa chỉ đã được dành cho process chưa chắc đã có trang RAM riêng gắn vào mọi phần của vùng đó.

**Mapping — vùng ánh xạ** là một khoảng địa chỉ ảo có quy tắc sử dụng, như được đọc/ghi và lấy dữ liệu từ đâu. Ví dụ ánh xạ một file để đọc, hoặc tạo vùng làm việc không gắn với file dữ liệu. Có mapping không đồng nghĩa toàn bộ nội dung đã hiện diện trong RAM.

Tình huống xuyên suốt là chương trình Python xin vùng làm việc 16 MiB để chuẩn bị xử lý dữ liệu. **MiB** là `1024 × 1024` byte; **byte** là đơn vị 8 bit trên môi trường này. Ta sẽ quan sát trước khi ghi vào vùng và sau khi ghi một byte trong mỗi trang. Không xem riêng “đã xin 16 MiB” là bằng chứng “đã dùng 16 MiB RAM”. Xem [tổng quan quản lý bộ nhớ của kernel](https://docs.kernel.org/admin-guide/mm/concepts.html).

## 2. Kernel và phần cứng nối địa chỉ ảo với RAM như thế nào?

**Page — trang bộ nhớ** là khối mà hệ thống dùng để quản lý nhiều thao tác ánh xạ. **Page size — kích thước trang** phụ thuộc kiến trúc/cấu hình: dùng `getconf PAGESIZE` để đọc kích thước trang cơ sở trên máy. Nếu trả `4096` thì trang cơ sở là 4096 byte; không mặc định mọi máy đều như vậy.

**Page table — bảng trang** lưu thông tin dịch từ trang ảo sang trang vật lý và các trạng thái/quyền liên quan. **Permission — quyền truy cập** với bộ nhớ ở đây cho biết vùng có được đọc, ghi hoặc thực thi mã hay không; khác với quyền đọc/ghi tên file. **MMU — bộ phận quản lý bộ nhớ** của CPU hỗ trợ dịch địa chỉ và kiểm tra quyền. **TLB — bộ nhớ đệm kết quả dịch địa chỉ** giúp CPU tránh phải đọc bảng trang từ đầu cho mọi lần truy cập. **Cache — bộ nhớ đệm** là nơi giữ bản dùng lại để giảm chi phí lấy/tính lại; TLB lưu bản dịch, không phải cache nội dung file.

```text
Chương trình: ghi vào địa chỉ ảo trong vùng 16 MiB
    |
    v
CPU/MMU: tìm bản dịch (TLB hoặc bảng trang), kiểm tra quyền
    |
    +-- đã có trang phù hợp --> ghi vào RAM --> chương trình tiếp tục
    |
    +-- cần kernel xử lý --> page fault --> kernel kiểm tra vùng/quyền
                                      |
                                      +-- hợp lệ: chuẩn bị trang, thử lại lệnh
                                      +-- không hợp lệ: báo lỗi cho process
```

Đọc theo mũi tên từ trên xuống. Nhánh phải là việc truy cập cần hỗ trợ, không tự kết luận chương trình hỏng. Sau khi xử lý một truy cập hợp lệ, CPU có thể thực hiện lại lệnh gây sự kiện đó; chương trình thường không tự gọi hàm “xin sửa page fault”.

Không thấy bản dịch trong TLB cũng không tự đồng nghĩa page fault: phần cứng có thể tìm thấy bản dịch hợp lệ trong bảng trang. Và trang cơ sở không giải thích mọi mức ánh xạ: **huge page — trang lớn** có thể gộp nhiều trang cơ sở, làm số lần fault khác phép chia `kích thước / PAGESIZE`. Lab quan sát xu hướng, không yêu cầu fault đếm đúng từng trang.

## 3. Stack, heap và `malloc` nằm ở đâu trong mô hình này?

**Stack — vùng ngăn xếp** phục vụ các lần gọi hàm: giữ thông tin trở về và nhiều biến có vòng đời gắn với lần gọi hàm. **Stack frame — khung gọi hàm** là phần dữ liệu cho một lần gọi; ví dụ hàm C gọi hàm khác cần nhớ sẽ quay lại đâu. Chi tiết đặt biến phụ thuộc **compiler — trình biên dịch chuyển mã nguồn thành mã máy**, ví dụ GCC: biến có thể được tối ưu vào thanh ghi hoặc bỏ đi, nên không khẳng định mọi biến cục bộ luôn nằm trên stack.

**Heap — vùng cấp phát động** phục vụ dữ liệu có vòng đời do chương trình quyết định, như mảng tạo bằng `malloc` và trả lại bằng `free`. **Allocator — bộ quản lý cấp phát trong thư viện** chia, giữ lại và tái sử dụng các khối bộ nhớ để tránh xin kernel cho mỗi object. **Object** ở đây là một vùng dữ liệu có cấu trúc/vòng đời trong chương trình, ví dụ danh sách bản ghi.

**API — giao diện lập trình** là tập hàm/quy tắc ứng dụng được dùng; `malloc` là một API thư viện C xin một khối, trả con trỏ hoặc `NULL` khi thất bại. Allocator có thể lấy vùng lớn từ kernel rồi chia nhỏ, hoặc tạo mapping riêng cho một số yêu cầu; không phải mỗi lần `malloc` là một **syscall — lời gọi hệ thống để nhờ kernel thực hiện việc cần quyền quản lý tài nguyên**, như tạo mapping mới. Cũng không phải mọi cấp phát động hiện thành một vùng tên `[heap]` trong `/proc/PID/maps`. **`/proc`** là cây file đặc biệt mà kernel dùng công bố trạng thái hiện tại; `maps` mô tả các mapping của process, không phải bản sao nội dung RAM.

**`mmap`** là giao diện tạo mapping; lab dùng trực tiếp nó để tách bước “dành vùng địa chỉ” khỏi “ghi vào bộ nhớ”. `malloc` thành công hay `mmap` thành công chưa bảo đảm mỗi trang đã có RAM riêng. **Overcommit — cho phép cam kết cấp phát vượt lượng có thể phục vụ ngay** là một chính sách Linux có thể dùng, tùy cấu hình; bộ nhớ thực cần được đáp ứng khi sử dụng. Xem [malloc(3)](https://man7.org/linux/man-pages/man3/malloc.3.html) và [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html).

Tự kiểm tra ở lab bằng `cat /proc/PID/maps`: tìm vùng đọc/ghi kích thước tương ứng, nhưng không suy ra lượng RAM từ độ dài vùng. Công cụ đếm resident ở mục 6 mới trả lời câu hỏi đó. Khi `free` của C hoặc Python bỏ object, allocator có thể giữ vùng để tái dùng, nên RSS chưa chắc giảm ngay; điều này khác với việc chương trình giữ tham chiếu vô hạn gây rò rỉ.

## 4. Page fault có nghĩa là lỗi chương trình không?

**Page fault — sự kiện lỗi trang** xảy ra khi truy cập bộ nhớ cần kernel xử lý thay vì hoàn tất ngay theo ánh xạ/quyền hiện tại. **Demand paging — cấp trang theo nhu cầu** nghĩa là chỉ chuẩn bị nhiều phần bộ nhớ khi chúng thực sự được truy cập. Nó tiết kiệm RAM cho vùng đã dành địa chỉ nhưng chưa dùng.

Trong vùng làm việc của lab:

1. `mmap` tạo vùng hợp lệ cho đọc/ghi. Đầu ra là một khoảng địa chỉ chương trình được phép dùng, chưa nhất thiết là đủ 16 MiB RAM riêng.
2. Chương trình ghi một byte vào một trang chưa được chuẩn bị. CPU phát sinh page fault và chuyển xử lý sang kernel.
3. Kernel thấy địa chỉ thuộc vùng cho phép ghi; nó cấp hoặc chuẩn bị trang thích hợp và cập nhật ánh xạ.
4. Chương trình tiếp tục. RAM resident và bộ đếm fault có thể tăng.

**Minor fault — lỗi trang nhẹ** theo thống kê Linux là lần xử lý không cần tải trang từ thiết bị lưu trữ. Ví dụ nối một trang đã có sẵn hoặc cấp trang cho vùng làm việc. **Major fault — lỗi trang cần tải dữ liệu** có liên quan việc lấy trang từ lưu trữ. Minor không có nghĩa miễn phí; vẫn có công việc của kernel. Major không phải số lần đọc file của ứng dụng và không luôn tương ứng một syscall `read`. Các bộ đếm này là một góc nhìn về xử lý trang, không đo toàn bộ I/O. Xem [getrusage(2)](https://man7.org/linux/man-pages/man2/getrusage.2.html).

**Segmentation fault — lỗi truy cập bộ nhớ không hợp lệ** khác với fault được xử lý bình thường. Ví dụ ghi vào vùng chỉ cho đọc hoặc địa chỉ không thuộc vùng hợp lệ có thể khiến kernel gửi **`SIGSEGV` — tín hiệu báo lỗi truy cập bộ nhớ**. **Signal — tín hiệu** là thông báo gửi cho process/luồng; mặc định SIGSEGV thường làm process kết thúc. Bài này không cố tạo SIGSEGV. Quy tắc về quyền/vùng hợp lệ có thể đối chiếu trong [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html).

## 5. Sau `fork`, cha và con có phải nhân đôi mọi RAM ngay?

**`fork`** là cơ chế tạo process con từ process hiện tại. **Copy-on-write — sao chép khi ghi**, viết **COW**, cho phép cha và con lúc đầu dùng chung nhiều trang mà bình thường mỗi bên phải có góc nhìn dữ liệu riêng. Kernel đánh dấu để lần ghi vào một trang cần được xử lý; khi cần, nó tạo bản riêng cho bên ghi.

```text
Ngay sau fork, trước khi ghi:
  Cha: trang ảo X ---+
                    +--> trang RAM chung: dữ liệu cũ
  Con: trang ảo X ---+

Sau khi con ghi và cần bản riêng:
  Cha: trang ảo X ------> trang RAM chứa dữ liệu cũ
  Con: trang ảo X ------> trang RAM riêng chứa dữ liệu mới
```

Mũi tên thể hiện ánh xạ, không phải dây nối vật lý. Lợi ích là không sao chép ngay các trang con có thể không bao giờ sửa, đặc biệt khi con sắp nạp chương trình khác bằng `exec`. Khi ghi nhiều trang, chi phí RAM/sao chép xuất hiện dần. Không áp dụng suy luận này cho mọi mapping: vùng chủ đích chia sẻ có thể cho hai process cùng nhìn thấy thay đổi, và kernel có các tối ưu tùy trang/tham chiếu. Xem [fork(2)](https://man7.org/linux/man-pages/man2/fork.2.html).

**RSS — resident set size** đếm lượng trang của process đang hiện diện trong RAM, gồm cả trang dùng chung. **PSS — proportional set size** chia phần mỗi trang dùng chung theo số ánh xạ dùng nó, giúp ước lượng phần RAM mà process có thể được quy trách nhiệm. Ví dụ mô hình: một trang 4 KiB được ánh xạ một lần trong mỗi process của hai process; mỗi bên có thể tính 4 KiB RSS nhưng chỉ khoảng 2 KiB PSS cho trang đó. Cộng RSS thành 8 KiB sẽ đếm trùng RAM 4 KiB này. Đây là ví dụ một trang, bỏ qua mã, thư viện và trang khác.

Tự kiểm tra bằng `/proc/PID/smaps_rollup`, hoặc cộng các trường trong `smaps` khi kernel không có bản tổng hợp. PSS là số đo chia sẻ theo mapping tại thời điểm đọc, không phải cam kết “dừng process sẽ giải phóng đúng số đó”. Xem [proc_pid_smaps(5)](https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html).

## 6. Nên nhìn VSZ, RSS, `MemFree` hay `MemAvailable`?

**VSZ — virtual memory size** trong `ps` là tổng kích thước bộ nhớ ảo của process, thường trình bày theo KiB. **KiB** là 1024 byte. VSZ gồm vùng địa chỉ không resident và các mapping như thư viện; nó không đồng nghĩa RAM đã dùng. RSS cũng thường dùng KiB trong lệnh `ps` dưới đây. Số `/proc` là thống kê kernel có độ chính xác/thời điểm khác nhau; riêng RSS trong `ps` không thay thế phân tích chi tiết `smaps`.

Bảng sau dùng để chọn câu hỏi đúng, không chọn một số “chuẩn tuyệt đối” cho mọi tình huống:

| Bạn muốn biết | Chỉ số/công cụ | Điều chưa được kết luận |
|---|---|---|
| Process đã có bao nhiêu vùng địa chỉ? | VSZ, `/proc/PID/maps` | Không cho lượng RAM riêng |
| Bao nhiêu trang ánh xạ đang ở RAM? | RSS | Cộng process có thể đếm trùng |
| Phần resident được chia theo dùng chung? | PSS trong `smaps_rollup` | Không là lượng RAM chắc chắn thu hồi khi dừng |
| RAM toàn hệ thống còn hoàn toàn trống? | `MemFree`, cột `free` của `free` | Không tính khả năng lấy lại cache |
| Ước lượng có thể dùng thêm mà không cần swap? | `MemAvailable`, cột `available` | Là ước lượng, không bảo đảm mọi cấp phát thành công |

`free -h` hiển thị thống kê toàn hệ thống với đơn vị dễ đọc; `-h` làm tròn nên không dùng để đối chiếu chênh lệch vài KiB. `MemAvailable` tính đến một phần bộ nhớ có thể thu hồi và ngưỡng kernel cần giữ lại. Máy có nhiều cache nên `free` thấp vẫn có thể có `available` khá cao. Không cộng tùy tiện các cột `used`, `buff/cache`, `shared`: ý nghĩa/cách tính có thể khác theo phiên bản procps. Xem [free(1)](https://man7.org/linux/man-pages/man1/free.1.html).

**Memory leak — rò rỉ bộ nhớ** là tình trạng bộ nhớ không còn cần cho công việc nhưng không được trả/tái sử dụng phù hợp, thường làm nhu cầu tăng theo thời gian. VSZ lớn ở một ảnh chụp không chứng minh leak. Hãy so sánh cùng workload — lượng/cách công việc — qua thời gian, nhìn resident/private và hành vi ứng dụng. Cache có giới hạn hoặc allocator giữ vùng để tái dùng có thể làm số lớn mà không là leak.

## 7. Cache, reclaim và swap giúp RAM phục vụ nhiều việc ra sao?

**Page cache — bộ đệm trang dữ liệu file** giữ dữ liệu file trong RAM để dùng lại. Lần đọc file thứ hai có thể nhanh hơn vì dữ liệu đã trong cache; không có nghĩa ổ đĩa tự nhanh lên. **File-backed page — trang có dữ liệu nền từ file** có thể được tái tạo bằng cách đọc file đó. **Anonymous memory — bộ nhớ không gắn với file dữ liệu sẵn có**, ví dụ nhiều vùng dữ liệu làm việc của ứng dụng, không có đường dẫn file thông thường để đọc lại nội dung vừa sửa.

**Reclaim — thu hồi bộ nhớ** là kernel tìm cách giải phóng trang cho nhu cầu mới. **Clean page — trang sạch** là trang file không chứa sửa đổi chưa ghi lại, thường có thể bỏ khỏi RAM rồi đọc lại sau. **Dirty page — trang bẩn** chứa dữ liệu đã thay đổi cần lưu; **writeback — ghi ngược về nơi lưu** đưa thay đổi ra trước khi có thể giải phóng phù hợp. Do đó bộ nhớ “có thể thu hồi” không luôn thu hồi ngay hoặc miễn phí.

**Swap — vùng trao đổi** là nơi lưu ngoài RAM cho một số trang khi hệ thống hỗ trợ/cấu hình. Swap có thể giúp giữ dữ liệu không có file nền sẵn, nhưng truy cập lại có thể tốn thời gian; không làm RAM vật lý tăng. Swap cũng có thể dùng lưu trữ nén trong RAM tùy cấu hình, nên không luôn là phân vùng trên SSD. Dùng `swapon --show` để xem vùng đang hoạt động; kết quả rỗng có thể nghĩa là không có swap, không phải `free` bị lỗi.

Đường đi dưới đây là mô hình cần nhớ, không là cam kết kernel luôn chọn đúng thứ tự:

```text
Cần trang cho công việc mới
    |
    +--> có RAM dùng được: phục vụ yêu cầu
    |
    +--> cần thu hồi: bỏ cache sạch / ghi lại dữ liệu bẩn / swap nếu phù hợp
                            |
                            +--> đủ: tiếp tục
                            +--> vẫn không đáp ứng: cấp phát lỗi hoặc đường OOM
```

Các nhánh cho thấy reclaim có nhiều nguồn; RAM trống thấp chưa đủ để kết luận hết bộ nhớ. Không xóa cache của kernel hoặc tạo hàng loạt cấp phát để “thử thiếu RAM” trong lab. Xem [khái niệm quản lý bộ nhớ](https://docs.kernel.org/admin-guide/mm/concepts.html) và phần `meminfo` trong [tài liệu /proc của kernel](https://docs.kernel.org/filesystems/proc.html).

## 8. Vì sao host còn RAM mà container vẫn có thể OOM?

**OOM — out of memory** là tình trạng không đáp ứng được nhu cầu bộ nhớ trong phạm vi liên quan. **OOM killer** là cơ chế kernel có thể chọn dừng process để lấy lại bộ nhớ; không phải mọi lần cấp phát thất bại đều kích hoạt nó, và không có quy tắc “luôn giết process có RSS lớn nhất”.

**Host — máy chủ chạy môi trường khác** là hệ thống bên ngoài container. **Container — môi trường cô lập cho các process** thường vẫn dùng kernel của host. **Cgroup — nhóm kiểm soát tài nguyên** gom process để theo dõi/giới hạn tài nguyên; ví dụ container bị giới hạn bộ nhớ 256 MiB trong khi host có nhiều GiB. **GiB** là `1024 MiB`. Chạm giới hạn nhóm có thể gây reclaim/OOM trong nhóm trước khi RAM host hết.

Trên **cgroup v2 — phiên bản giao diện kiểm soát nhóm thứ hai**, `memory.current` cho lượng bộ nhớ được tính cho nhóm, `memory.max` là giới hạn cứng (`max` nghĩa không đặt mức trần tại đó), `memory.events` có bộ đếm như `oom` và `oom_kill`. `memory.high` có thể tạo áp lực thu hồi/throttling trước mức cứng; **throttling — làm chậm có kiểm soát** khiến công việc chờ để giảm mức tiêu thụ. Xem [tài liệu cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).

Tự kiểm tra trước bằng `cat /proc/self/cgroup`: dòng kiểu `0::/duong-dan-nhom` chỉ ra nhóm v2 mà process nhìn thấy. Sau đó cần xác định cây cgroup thực sự có thể đọc trong môi trường; đường dẫn có thể khác do cách container cô lập cây. Đọc `memory.max`, `memory.current` và `memory.events` của **đúng nhóm** thay vì mặc định luôn là `/sys/fs/cgroup/memory.max`. Giới hạn ở nhóm tổ tiên (nhóm bao ngoài nhóm đang xem) cũng có thể ràng buộc: `memory.max` ở nhóm hiện tại là `max` chưa chứng minh tiến trình không có trần bộ nhớ. `memory.events` có thể tính cả sự kiện của nhóm con; nếu cần phân biệt phạm vi cục bộ, xem `memory.events.local` khi giao diện này được cung cấp. Không sửa các file này trong lab. Cgroup v1 có bố cục/tên file khác.

Nếu chương trình bị kết thúc, “Killed” hoặc trạng thái 137 chỉ gợi ý bị `SIGKILL` trong shell/container thông thường. **SIGKILL** là tín hiệu kết thúc cưỡng bức, có thể được gửi vì nhiều lý do; muốn kết luận OOM phải đối chiếu log kernel hoặc sự kiện nhóm đúng thời điểm. Xem log có thể cần quyền mà tài khoản lab không có; thiếu quyền đọc log không chứng minh không có OOM.

## 9. Lab: dành vùng 16 MiB rồi chạm từng trang

### 9.1. Điều kiện và giới hạn

**Terminal — cửa sổ giao tiếp văn bản** cho phép gõ lệnh và xem đầu ra. **Shell — trình thông dịch lệnh**, ví dụ Bash, chạy bên trong và thực hiện các lệnh bạn gõ. Cần hai terminal, Python 3, `ps`, `free`, `vmstat`; không cần root. Kiểm tra máy/nhóm còn dư bộ nhớ cho Python và ít nhất vùng thử. Mặc định chỉ 16 MiB; trên board ít RAM có thể sửa `size` thành `4 * 1024 * 1024`, hoặc bỏ lab khi hệ thống đang thiếu bộ nhớ. Không tăng vùng đến khi chương trình bị giết. Không thay `swappiness`, giới hạn cgroup hay xóa cache.

Terminal A:

```bash
command -v python3
command -v ps
command -v free
command -v vmstat
getconf PAGESIZE
free -h
mkdir -p ~/linux-lab/memory
cd ~/linux-lab/memory
```

`command -v` chỉ xác nhận shell tìm được công cụ, không xác nhận có quyền đọc mọi process. `mkdir -p` tạo thư mục riêng. Nếu cần, đọc thêm giới hạn nhóm như mục 8 trước khi chạy.

Lưu đoạn sau thành `touch-pages.py`:

```python
import mmap
import os
import resource

size = 16 * 1024 * 1024
page = os.sysconf("SC_PAGE_SIZE")
area = mmap.mmap(
    -1, size,
    flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS,
    prot=mmap.PROT_READ | mmap.PROT_WRITE,
)
print("PID", os.getpid(), "size", size, "page", page, flush=True)
try:
    input("Quan sat TRUOC khi ghi; Enter de ghi tung trang...")
    before = resource.getrusage(resource.RUSAGE_SELF)
    for offset in range(0, size, page):
        area[offset] = 1
    after = resource.getrusage(resource.RUSAGE_SELF)
    print("minor fault delta:", after.ru_minflt - before.ru_minflt, flush=True)
    print("major fault delta:", after.ru_majflt - before.ru_majflt, flush=True)
    input("Quan sat SAU khi ghi; Enter de dong mapping va ket thuc...")
finally:
    area.close()
```

Đây là API Unix của Python, chọn rõ **`MAP_PRIVATE` — vùng ánh xạ riêng** và **`MAP_ANONYMOUS` — không lấy dữ liệu từ file**, thay vì dựa vào mặc định `mmap.mmap(-1, size)` trên Unix vốn dùng mapping chia sẻ. `PROT_READ | PROT_WRITE` cho phép đọc/ghi; dấu `|` kết hợp cờ. Không thử ghi ngoài kích thước vùng.

`resource.getrusage` lấy thống kê của process hiện tại; **delta — độ chênh lệch** là giá trị sau trừ trước. `range(0, size, page)` chọn đầu mỗi trang; ghi một byte cũng khiến cả trang liên quan cần được xử lý. `flush=True` đẩy dòng thông báo ra ngay để lấy PID. `finally` đóng vùng ngay cả khi ngắt bằng `Ctrl+C`. Xem [mmap của Python](https://docs.python.org/3/library/mmap.html).

Chạy trong terminal A:

```bash
python3 touch-pages.py
```

Dừng ở câu hỏi đầu tiên để terminal B quan sát. Chưa nhấn Enter vội.

### 9.2. Đọc đúng process ở terminal B

Thay `12345` bằng PID thật vừa in; **placeholder — giá trị giữ chỗ** không phải số bạn được chép nguyên:

```bash
lab_pid=12345
ps -p "$lab_pid" -o pid,vsz,rss,comm
cat "/proc/$lab_pid/smaps_rollup"
cat "/proc/$lab_pid/maps"
```

`lab_pid` là biến shell lưu PID. `ps -p` chọn process đó; `vsz` và `rss` là kích thước KiB. Trong `smaps_rollup`, xem `Rss`, `Pss`, `Private_Dirty` và `Anonymous` nếu có. **Private_Dirty** chỉ lượng trang riêng đã sửa đổi theo phân loại thống kê, không chỉ riêng vùng lab; **Anonymous** cũng tổng hợp process chứ không chỉ một object. Tên/trường bổ sung thay đổi theo kernel.

Nếu `smaps_rollup` không có, dùng:

```bash
cat "/proc/$lab_pid/smaps"
```

`smaps` có một nhóm trường cho **mỗi mapping**, nên một dòng `Rss` riêng không phải tổng process. Để chỉ cộng RSS/PSS, có thể dùng:

```bash
awk '/^Rss:/ {rss += $2} /^Pss:/ {pss += $2} END {print "Rss_kB", rss, "Pss_kB", pss}' "/proc/$lab_pid/smaps"
```

**`awk`** là công cụ xử lý văn bản theo dòng; mẫu `/^Rss:/` chọn dòng bắt đầu đúng tên trường, `$2` lấy số ở cột thứ hai, `END` in tổng. Không cộng tiếp `smaps_rollup` vào `smaps`, vì bản tổng hợp đã đại diện các mapping đó. Nếu bị từ chối quyền, xác nhận dùng tài khoản chạy Python và PID đúng; chính sách `/proc` có thể giới hạn quan sát. Không có thư mục PID thường nghĩa process đã kết thúc hoặc số sai.

### 9.3. Ghi từng trang rồi so sánh

Quay lại terminal A, nhấn Enter một lần. Python ghi từng trang, in delta fault rồi đợi ở câu hỏi thứ hai. Lặp lại ở terminal B:

```bash
ps -p "$lab_pid" -o pid,vsz,rss,comm
cat "/proc/$lab_pid/smaps_rollup"
free -h
vmstat 1 5
```

Ví dụ **minh họa**, không phải số chuẩn bắt buộc:

```text
               VSZ       RSS
Truoc touch:  28500      9500
Sau touch:    28500     25884
minor fault delta: 4096
major fault delta: 0
```

Ở đây VSZ đã gồm vùng 16 MiB trước khi ghi nên gần như giữ nguyên; RSS tăng khoảng `16384 KiB`. Nếu page size là `4096`, vùng có `4096` trang cơ sở; delta minor khoảng con số này là phù hợp nhưng không bắt buộc bằng đúng. **Runtime — mã hỗ trợ lúc chương trình chạy**, như quản lý dữ liệu của Python, cùng tối ưu trang lớn, thay đổi trang khác và hoạt động trong quá trình đo có thể tạo chênh lệch. Với mapping private anonymous của lab, lượng riêng/anonymous thường tăng; không suy ra số ấy cho mapping chia sẻ, file mapping hoặc mọi cách `malloc`.

Major delta thường là `0` khi cấp vùng anonymous nhỏ trên máy đủ RAM. Kết quả khác cần kiểm tra áp lực bộ nhớ và hoạt động của cả process; phép đo `getrusage` bao phủ toàn process trong khoảng đó, không chỉ một dòng gán.

`free -h` cho toàn hệ thống, nên thay đổi nhỏ của lab có thể bị làm tròn hoặc bị hoạt động khác che mất. `vmstat 1 5` in 5 mẫu, các mẫu sau cách khoảng 1 giây. **`si`/`so`** là tốc độ dữ liệu swap vào/ra; `swpd` là lượng swap đang dùng. Dòng đầu của nhiều thống kê tốc độ là trung bình từ lúc khởi động, không phải riêng giây vừa rồi. Đơn vị và cột khác phụ thuộc phiên bản; dùng `man vmstat` trên máy và đối chiếu [manual vmstat của dự án procps](https://gitlab.com/procps-ng/procps/-/blob/master/man/vmstat.8). Không thấy swap I/O trong 5 giây chỉ nói không quan sát được trong khoảng đó, không chứng minh máy chưa bao giờ swap.

Nhấn Enter lần cuối ở terminal A để đóng mapping và kết thúc Python. Sau đó `ps -p "$lab_pid"` không còn process đó nếu PID chưa được tái sử dụng. Không cần xóa thư mục lab; chỉ file code còn trên đĩa, vùng RAM thử đã hết vòng đời.

### 9.4. Nếu kết quả không giống kỳ vọng

- **RSS tăng ít:** kiểm tra đã nhấn Enter qua bước ghi chưa, đang xem đúng PID không và vòng lặp có lỗi không. Sau đó xem `smaps` từng vùng, kiểm tra việc reclaim/swap hoặc môi trường đo.
- **VSZ khác ví dụ:** Python, thư viện, CPU và phiên bản khác làm tổng khác. So trước/sau cùng process, không so số tuyệt đối với bảng.
- **Không tìm thấy `mmap.MAP_ANONYMOUS`:** lab dành cho Python trên Linux; kiểm tra **interpreter — chương trình thực thi mã Python** và môi trường, không tự thay bằng mapping khác rồi giữ nguyên kết luận.
- **Process bị giết hoặc `mmap` báo lỗi:** dừng thử, kiểm tra RAM và giới hạn nhóm; giảm kích thước nếu phù hợp. Không tiếp tục tăng kích thước để tái tạo OOM.
- **`vmstat` thiếu:** đây là công cụ procps; BusyBox có thể khác hoặc không có. Lab trước/sau bằng `/proc` vẫn là phần chính, thống kê toàn hệ thống là bổ sung.

## 10. Một máy nhiều CPU có phải mọi RAM đều có cùng chi phí?

**NUMA — truy cập bộ nhớ không đồng nhất** là cách tổ chức phần cứng trong đó RAM được chia theo **node — nhóm tài nguyên gần nhau**; CPU truy cập RAM gần nó có thể nhanh hơn RAM ở node khác. Ví dụ server nhiều socket — vị trí gắn CPU vật lý — có nhiều vùng RAM gắn với từng nhóm CPU.

Do đó còn RAM trống toàn máy không chứng minh truy cập nào cũng có cùng độ trễ hay việc cấp phát ở node mong muốn luôn dễ. Chính sách đặt bộ nhớ và vị trí thread chạy cùng ảnh hưởng hiệu năng. **Thread — luồng thực thi** là một dòng công việc được CPU chạy trong process, thường dùng chung không gian địa chỉ với các thread cùng process.

Nếu có `lscpu`, xem phần `NUMA node(s)` và CPU thuộc node nào; `numactl --hardware` có thể cho thêm thông tin khi công cụ được cài. Có công cụ không có nghĩa máy có nhiều node, và nhiều node logic chưa đo được độ trễ truy cập thật. Lab không đổi chính sách NUMA. Xem [NUMA memory policy của kernel](https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html).

## 11. Lỗi suy luận thường gặp

- **“VSZ là RAM dùng”:** VSZ là độ lớn địa chỉ; kiểm chứng resident bằng RSS và chia sẻ bằng PSS.
- **“Page fault là chương trình crash”:** nhiều fault hợp lệ là phần bình thường của demand paging/COW; lỗi quyền/vùng có thể dẫn tới SIGSEGV.
- **“RSS cộng các process là tổng RAM duy nhất”:** trang chia sẻ bị đếm lại; dùng PSS để ước lượng có phân chia, đồng thời nhớ còn bộ nhớ kernel và cache không thuộc cách cộng đó.
- **“RAM free thấp thì chạy `drop_caches`”:** hãy đọc `available`, hoạt động reclaim/swap và nhu cầu thực; xóa cache tùy tiện làm phép đo và hiệu năng thay đổi, không sửa nguyên nhân.
- **“Swap đang dùng tức là máy đang chậm vì swap”:** cần đo hoạt động vào/ra và triệu chứng theo thời gian. Trang nằm trong swap có thể chưa được truy cập lại.
- **“Host còn RAM nên loại trừ OOM”:** kiểm tra giới hạn/sự kiện cgroup; thông tin `free` bên trong container cũng không bảo đảm phản ánh mức trần của nhóm.
- **“`strace` không có `read` nên không lấy dữ liệu”:** truy cập mapping có thể lấy trang qua page fault; trace syscall không bao phủ mọi hoạt động bộ nhớ.

## 12. Tự kiểm tra bằng tình huống mới

1. Process có VSZ 2 GiB, RSS 40 MiB. Có đủ bằng chứng nó chiếm 2 GiB RAM không? **Đối chiếu:** không; nêu mapping chưa resident và nhu cầu thêm có thể xuất hiện khi dùng.
2. `malloc` trả con trỏ khác `NULL`. Có bảo đảm ghi vào mọi trang sau này không gặp áp lực/OOM không? **Đối chiếu:** không; phân biệt thành công của cấp phát địa chỉ với phục vụ trang theo chính sách và giới hạn.
3. Cha/con dùng chung một trang 4 KiB, mỗi bên một mapping. RSS/PSS cho phần trang ấy là gì? **Đối chiếu:** mỗi bên RSS 4 KiB, PSS khoảng 2 KiB; con ghi và cần bản riêng có thể làm tổng RAM tăng.
4. Đọc file lần hai nhanh hơn và `MemFree` thấp. Có kết luận thiếu RAM hoặc ổ đĩa nhanh lên không? **Đối chiếu:** không; đưa giả thuyết page cache và kiểm tra `MemAvailable`/hoạt động hệ thống, giữ các điều kiện đo giống nhau.
5. Container bị SIGKILL trong khi host còn 10 GiB `available`. Bước tiếp theo là gì? **Đối chiếu:** tìm đúng cgroup, xem giới hạn và sự kiện/log theo thời điểm; không kết luận OOM chỉ từ tín hiệu.
6. Đổi vùng lab từ 16 xuống 4 MiB. Dự đoán trước khi chạy? **Đối chiếu:** phần VSZ do mapping giảm, mức RSS tăng sau ghi thường giảm tương ứng; delta minor phụ thuộc page size và cách kernel quản lý, không cam kết bằng tuyệt đối.
7. `free()` chạy nhưng RSS chưa giảm. Có chắc leak không? **Đối chiếu:** giải thích allocator tái sử dụng, rồi đề xuất đo xu hướng qua nhiều vòng workload và xem vùng private/anonymous.

**Ghi nhớ:** địa chỉ ảo là góc nhìn của chương trình; mapping và bảng trang tổ chức quyền/cách cung cấp dữ liệu; RAM resident xuất hiện theo nhu cầu. Fault hợp lệ giúp demand paging và COW hoạt động. Cache/reclaim/swap cùng giới hạn cgroup quyết định khả năng đáp ứng, còn mỗi công cụ chỉ cho một lát cắt. Bài 18 chuyển từ “dữ liệu nằm ở đâu” sang “luồng công việc nào được CPU chạy và khi nào”.

## Nguồn và tra cứu trên máy

Các nguồn chính thức/Linux man-pages đã được đặt cạnh nội dung liên quan: [memory management của kernel](https://docs.kernel.org/admin-guide/mm/index.html), [giao diện /proc](https://docs.kernel.org/filesystems/proc.html), [cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [smaps](https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html), [Python mmap](https://docs.python.org/3/library/mmap.html). Tra bản tương ứng máy bằng `man 5 proc`, `man 2 mmap`, `man 2 getrusage`, `man 3 malloc`, `man free`, `man vmstat`. Luôn ghi kernel, Python, kích thước trang và môi trường host/container khi so kết quả giữa các máy.
