# Bài 12 — Tiến trình, thread và signal

[Mục lục](../README.md) · [← Bài 11](11-package-va-thu-vien.md) · [Bài 13 →](13-shell-scripting.md)

## Mục tiêu và tình huống xuyên suốt

Nên học bài 08 và 11 trước. Sau bài này, bạn cần tự giải thích được: chương trình khác tiến trình thế nào; vì sao một tiến trình có nhiều luồng; tạo con, thay chương trình và thu hồi con là ba việc khác nhau; đọc được trạng thái `ps`; chọn signal phù hợp và kiểm tra kết quả thay vì chỉ tin lệnh đã chạy thành công.

Hãy hình dung một chương trình thu thập dữ liệu trên thiết bị Linux: nó chờ dữ liệu, xử lý rồi ghi kết quả. Bạn muốn biết nó còn hoạt động không, tạm dừng nó và cuối cùng yêu cầu nó lưu dữ liệu trước khi thoát. Bài học đi từ những thành phần thực hiện công việc này đến cách quan sát và điều khiển chúng.

Các lab dùng Linux, **shell — bộ đọc và thực hiện lệnh**. Shell nhận chữ bạn nhập, phân tích đối số và gọi chương trình hoặc chức năng có sẵn; ví dụ gõ `sleep 300` là yêu cầu shell chạy chương trình chờ. Bài dùng **Bash**, một loại shell phổ biến; có thể kiểm tra bằng `printf '%s\n' "$BASH_VERSION"` trong Bash. Công cụ `ps` thuộc bộ procps-ng dùng để xem tiến trình, còn Python 3 chạy các chương trình minh họa. Phần lab zombie cần Python từ 3.9; các lab còn lại ghi rõ yêu cầu nếu khác. Không cần quyền quản trị; chỉ tác động đến tiến trình do bạn vừa tạo. Trên thiết bị dùng BusyBox, bản công cụ gọn dành cho hệ nhỏ, `ps` có thể thiếu các tùy chọn ở đây. Khi đó đọc `ps --help` và dùng thông tin trong `/proc` như hướng dẫn bên dưới. Mọi đầu ra mẫu trong bài là **minh họa**, PID và thời gian trên máy bạn sẽ khác.

## 1. Khi gõ một lệnh, thứ gì thực sự chạy?

### 1.1. Chương trình trên ổ lưu trữ và tiến trình đang tồn tại

**Chương trình** là tập hợp chỉ dẫn để máy thực hiện công việc, chẳng hạn file thực thi `/usr/bin/sleep`. **Tiến trình — process** là một lần thực thi chương trình, cùng bộ nhớ, các tài nguyên và thông tin quản lý của lần chạy đó. File chương trình có thể còn trên ổ khi không có tiến trình nào chạy nó; ngược lại, chạy cùng chương trình hai lần thường tạo hai tiến trình khác nhau.

**Kernel — nhân hệ điều hành** là phần lõi quản lý CPU, bộ nhớ và việc truy cập thiết bị. CPU là bộ xử lý thực hiện chỉ dẫn. Chương trình ứng dụng và Bash chạy trong **user space — không gian ứng dụng**, nơi chúng phải yêu cầu kernel thực hiện các thao tác được kiểm soát như tạo tiến trình hoặc đọc dữ liệu. **System call — lời gọi hệ thống** là giao diện yêu cầu đó, ví dụ `fork()` yêu cầu tạo tiến trình con. Lệnh bạn gõ không phải bản thân kernel; Bash phân tích lệnh rồi tổ chức việc chạy nó.

Bạn có thể kiểm tra hai lớp này:

```bash
command -v sleep
sleep 300 &
lab_pid=$!
ps -p "$lab_pid" -o pid,ppid,stat,etime,args
```

`command -v` tìm cách shell sẽ gọi `sleep`; nó không xác nhận có `sleep` đang chạy. `sleep 300` chờ khoảng 300 giây; dấu `&` cho Bash chạy công việc ở nền và trả lại khả năng nhập lệnh. `$!` là PID của công việc nền vừa khởi chạy; gán ngay vào `lab_pid` để một lệnh nền khác không làm mất giá trị cần dùng. **PID — mã số tiến trình** giúp chọn đúng đối tượng trong hệ thống đang quan sát, ví dụ chọn một lần chạy `sleep` trong hai lần chạy cùng tên. PID chỉ có ý nghĩa trong phạm vi tiến trình bạn đang nhìn thấy và trong thời gian đối tượng còn tồn tại. **PPID — mã số tiến trình cha** chỉ tiến trình đã tạo hoặc hiện đang làm cha của nó.

Ví dụ `ps` có thể hiện:

```text
    PID    PPID STAT     ELAPSED COMMAND
  24110   23800 S          00:02 sleep 300
```

Đọc từ trái sang phải: tiến trình 24110 có cha 23800, đang chờ (`S`), đã tồn tại hai giây và chạy `sleep 300`. `ps` là ảnh chụp tại thời điểm đọc; nó không chứng minh tiến trình luôn ở trạng thái đó. Kết thúc ví dụ để không để lại công việc nền: **signal — tín hiệu** là thông báo điều khiển gửi đến tiến trình; `TERM` yêu cầu kết thúc, còn lệnh `wait` của Bash chờ và lấy kết quả của con. Vì đây là con do chính Bash vừa tạo nên Bash có thể chờ nó. Trong phần 5 và lab 1, bạn sẽ phân biệt gửi yêu cầu với hoàn tất kết thúc:

```bash
kill -TERM "$lab_pid"
wait "$lab_pid"
```

### 1.2. “Môi trường thực thi” gồm những gì?

**Không gian địa chỉ** là tập hợp các địa chỉ bộ nhớ mà chương trình có thể sử dụng. Bạn có thể hình dung nó như bản đồ riêng của một tiến trình: vùng chỉ dẫn, dữ liệu và vùng phục vụ các lời gọi hàm. Địa chỉ ở hai tiến trình có cùng giá trị không có nghĩa chúng trỏ vào cùng dữ liệu vật lý. Sự tách biệt giúp một ứng dụng không tùy tiện sửa dữ liệu của ứng dụng khác; vẫn có cơ chế chia sẻ bộ nhớ có chủ đích.

**File descriptor — số hiệu tài nguyên đang mở** là một số nguyên để chương trình yêu cầu đọc/ghi một tài nguyên. Ví dụ thông thường: 0 là đầu vào chuẩn, 1 là đầu ra chuẩn, 2 là đầu ra báo lỗi; chúng có thể nối với terminal hoặc file. **Terminal — thiết bị đầu cuối** là nơi bạn nhập lệnh và nhận chữ hiển thị. Descriptor không chỉ dùng cho file thường mà còn cho các kênh giao tiếp. Các số 0/1/2 chỉ là quy ước ban đầu: chương trình có thể đóng hoặc đổi đích của chúng. Kiểm tra descriptor của chính Bash:

```bash
ls -l /proc/$$/fd
```

`$$` là PID của Bash trong ngữ cảnh thông thường của lab. `/proc` là cây thông tin do kernel cung cấp dưới dạng file/thư mục, không phải kho file dữ liệu thông thường trên ổ. Thư mục `fd` chứa các liên kết cho biết descriptor đang nối đến đâu. Có thể thấy `0`, `1`, `2` trỏ đến `/dev/pts/...`, một terminal; nếu chuyển đầu ra vào file thì đích khác. Việc thấy descriptor chỉ cho biết tài nguyên mở, không chứng minh ứng dụng đang sử dụng nó đúng cách.

## 2. Vì sao cần phân biệt process với thread?

**Thread — luồng thực thi** là một đường thực hiện chỉ dẫn bên trong tiến trình. Ví dụ chương trình thu thập dữ liệu có một luồng chờ dữ liệu và một luồng xử lý dữ liệu. Luồng giúp tổ chức nhiều phần việc trong cùng môi trường tài nguyên.

Các luồng cùng tiến trình dùng chung dữ liệu trong không gian địa chỉ và bảng descriptor. Mỗi luồng có trạng thái thực thi riêng: **stack — ngăn xếp lời gọi**, vùng giữ dữ liệu phục vụ các hàm đang chạy; **thanh ghi**, các ô lưu trữ nhanh trong CPU giữ trạng thái tính toán; và vị trí chỉ dẫn cần chạy tiếp. Nhờ trạng thái riêng, luồng xử lý có thể tạm dừng rồi tiếp tục dù luồng nhận dữ liệu đã chạy thêm. Chia sẻ dữ liệu không có nghĩa dữ liệu tự được bảo vệ: nếu hai luồng đồng thời cập nhật một biến, ứng dụng cần cơ chế phối hợp để tránh kết quả phụ thuộc thứ tự chạy.

```text
Tiến trình thu thập dữ liệu (một PID)
├── Tài nguyên chung: bộ nhớ dữ liệu, bảng descriptor
├── Luồng chính: stack và trạng thái CPU riêng
├── Luồng nhận:  stack và trạng thái CPU riêng
└── Luồng xử lý: stack và trạng thái CPU riêng
                         ↓
                Kernel chọn luồng được chạy
                         ↓
                         CPU
```

Đọc từ trên xuống: các nhánh luồng cùng thuộc một tiến trình, nhưng mỗi nhánh có trạng thái riêng. Mũi tên cuối biểu thị kernel cấp thời gian CPU cho từng đơn vị thực thi; không phải cả ba luôn chạy đồng thời.

**Scheduler — bộ lập lịch** là cơ chế kernel chọn đơn vị thực thi được dùng CPU. **Task** là đối tượng thực thi kernel quản lý; trên Linux, mỗi luồng là một task có thể được lập lịch. **Runnable — sẵn sàng chạy** nghĩa là task có thể chạy khi được cấp CPU, không nhất thiết đang chiếm CPU. **Lõi CPU** là đơn vị xử lý bên trong CPU; máy có nhiều lõi có thể thực hiện nhiều đường chỉ dẫn cùng lúc. Kernel còn nhìn thấy **CPU logic**, đơn vị lập lịch do phần cứng cung cấp; một lõi có thể cung cấp nhiều CPU logic nhờ chia sẻ tài nguyên xử lý. Một CPU logic luân phiên phục vụ nhiều task; các CPU logic khác nhau có thể chạy task đồng thời, nhưng không có nghĩa mỗi task sở hữu riêng toàn bộ tài nguyên một lõi. Vì vậy số luồng lớn không chứng minh chương trình xử lý nhanh hơn: các luồng có thể đều chờ dữ liệu hoặc chờ nhau.

Trên Linux, **TID — mã số luồng** nhận diện từng luồng; các luồng cùng nhóm có chung mã nhóm **TGID**, thường là PID được công cụ hiển thị cho tiến trình. Luồng chính có TID bằng TGID. Xem bằng `ps -L` trong lab 3; không nhầm TID Linux với mọi loại mã luồng do thư viện/ngôn ngữ trả về. Nguồn đối chiếu: [pthreads(7)](https://man7.org/linux/man-pages/man7/pthreads.7.html).

## 3. Một tiến trình được tạo, đổi chương trình và kết thúc thế nào?

### 3.1. `fork()` tạo con, không phải chỉ mở một file chương trình

**Tiến trình cha/con** là quan hệ tạo tiến trình. Với `fork()`, kernel tạo con có PID mới. Cha nhận PID con từ lời gọi; con nhận giá trị 0, nên hai bên có thể chọn nhánh công việc khác nhau. Nếu tạo thất bại, cha nhận lỗi và không có con mới.

Con có không gian địa chỉ riêng, ban đầu chứa dữ liệu tương ứng với cha. Trên Linux, **copy-on-write — chỉ sao chép khi ghi** giúp tránh sao chép ngay toàn bộ dữ liệu bộ nhớ: các trang dữ liệu có thể được dùng chung vật lý lúc đầu; khi một bên sửa, kernel tách bản sao cần thiết. **Trang bộ nhớ** là đơn vị kernel dùng để quản lý các khối bộ nhớ, không phải một file. Ví dụ cha có biến bằng 10, con sửa thành 20 thì biến riêng của cha vẫn là 10. Đây là mô hình bộ nhớ thông thường sau fork; vùng được tạo để chia sẻ là ngoại lệ.

Các descriptor được kế thừa có điểm tinh tế: cha và con có bảng descriptor riêng nhưng các mục tương ứng có thể cùng tham chiếu đến một đối tượng file đang mở trong kernel. Vì thế vị trí đọc/ghi có thể được chia sẻ. Không suy ra “bộ nhớ riêng” đồng nghĩa “mọi tài nguyên hoàn toàn riêng”. Xem [fork(2)](https://man7.org/linux/man-pages/man2/fork.2.html); lab zombie bên dưới dùng `os.fork()` để quan sát cha/con, không đo chi phí copy-on-write.

### 3.2. `execve()` thay nội dung đang chạy trong tiến trình hiện tại

Sau khi tạo con, con thường cần chạy một chương trình khác. `execve()` nhận đường dẫn chương trình, các đối số và môi trường rồi thay hình ảnh chương trình của tiến trình gọi nó. **Đối số** là dữ liệu truyền trên dòng lệnh, như `300` trong `sleep 300`. **Môi trường** là các cặp tên/giá trị truyền cho chương trình, như biến `PATH` giúp shell tìm lệnh.

Nếu thành công, chương trình cũ không chạy tiếp sau lời gọi này; danh tính tiến trình thường thấy qua PID vẫn được giữ. Các ví dụ trong bài đều exec từ tiến trình một luồng; nếu exec trong tiến trình nhiều luồng, các luồng khác bị loại bỏ và có thêm quy tắc về danh tính luồng. Một số tài nguyên được giữ, một số bị thay/reset; chẳng hạn descriptor có cờ đóng khi exec sẽ bị đóng. Không nên hiểu exec là giữ nguyên mọi thuộc tính. Xem [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html).

Để tự kiểm chứng PID không đổi, chạy Bash con, tránh thay chính shell đang làm việc:

```bash
bash -c 'printf "before exec: PID=%s\n" "$$"; exec sleep 300' &
exec_pid=$!
sleep 0.2
ps -p "$exec_pid" -o pid,ppid,args
kill -TERM "$exec_pid"
wait "$exec_pid"
```

`bash -c` tạo một Bash thực hiện chuỗi lệnh trong dấu nháy. `exec` là lệnh của Bash yêu cầu thay chính Bash con bằng `sleep`. PID in trước exec phải khớp PID mà `ps` thấy đang chạy `sleep`. Chờ 0,2 giây chỉ giúp giảm khả năng đọc quá sớm, không phải bảo đảm đồng bộ trên máy quá tải; nếu vẫn thấy Bash, đọc lại `ps` ngay sau đó.

### 3.3. Kết thúc thực thi khác với thu hồi trạng thái

**Exit status — trạng thái kết thúc** là thông tin cho bên chờ biết công việc kết thúc thế nào. Một chương trình có thể tự thoát với mã 0 hoặc mã khác, hay bị kết thúc bởi signal. Kernel giữ đủ thông tin để cha lấy kết quả bằng các lời gọi thuộc họ `wait`, chẳng hạn `waitpid()` chọn một con cụ thể.

```text
Cha (Bash)                       Con
    │                             │
    ├──── tạo con ────────────────►│ PID mới
    │                             ├─ exec: chạy chương trình khác
    │                             ├─ hoạt động / chờ / tiếp tục
    │                             └─ kết thúc thực thi
    │                                   │
    │                         giữ trạng thái kết thúc (Z)
    └──── wait: nhận kết quả ────────────┘
                     ↓
           thu hồi thông tin con
```

Mũi tên tạo con tạo danh tính mới; exec ở nhánh con đổi chương trình; đường wait lấy kết quả rồi giải phóng thông tin còn giữ. Cha có thể gọi wait trước khi con thoát và chờ đến lúc có kết quả. **SIGCHLD — tín hiệu báo sự thay đổi trạng thái của con** giúp cha biết lúc nào nên kiểm tra, nhưng bản thân việc nhận tín hiệu không tự thay cho thao tác thu hồi con. Sơ đồ mô tả trường hợp thông thường cần thu hồi. Nếu ứng dụng chủ động đặt SIGCHLD thành bỏ qua hoặc dùng tùy chọn không giữ trạng thái con đã chết, Linux có thể không giữ zombie; không nhầm việc chủ động bỏ qua này với action mặc định của SIGCHLD. Đây là một lý do không thể chỉ dựa vào việc không thấy Z để kết luận cha đã gọi wait.

**Zombie — tiến trình đã kết thúc nhưng chưa được thu hồi trạng thái** không còn thực thi chỉ dẫn. Nó còn bản ghi quản lý nhỏ, không giữ toàn bộ bộ nhớ như một chương trình đang chạy. Gửi KILL không giải quyết zombie vì không còn hoạt động để giết; phải xử lý việc cha chờ con. Nhiều zombie tích tụ vẫn gây vấn đề vì tiêu thụ các bản ghi quản lý.

**Orphan — tiến trình mất cha ban đầu** là khái niệm về quan hệ cha, không phải trạng thái đã chết. Khi cha thoát, con được chuyển sang cha nhận nuôi phù hợp: có thể là **subreaper**, tiến trình được cấu hình nhận và thu hồi các hậu duệ mồ côi, hoặc tiến trình init liên quan. **Init** là tiến trình đầu tiên của môi trường tiến trình, thường mang PID 1 và có vai trò thu hồi con được nhận nuôi. Trong **PID namespace — phạm vi đánh số và nhìn thấy tiến trình**, ví dụ bên trong một container, PID và cha nhận nuôi nhìn thấy có thể khác bên ngoài. Container là môi trường ứng dụng được cô lập bằng cơ chế kernel; không mặc định cha mới luôn là PID 1 của toàn máy.

Một orphan vẫn có thể chạy bình thường; một zombie có thể vẫn còn cha ban đầu. Nguồn: [wait(2), phần NOTES](https://man7.org/linux/man-pages/man2/wait.2.html).

## 4. Đọc trạng thái để biết tiến trình đang làm gì

Công cụ `ps` in thông tin được quan sát tại một thời điểm. Cột `STAT` bắt đầu bằng trạng thái chính, có thể kèm ký tự phụ. Bảng sau giúp chọn câu hỏi cần kiểm tra tiếp, không phải chẩn đoán nguyên nhân chỉ bằng một chữ.

| Chữ | Ý nghĩa | Cách suy luận phù hợp |
|---|---|---|
| `R` | Đang chạy hoặc sẵn sàng chạy | Có khả năng được cấp CPU; không chứng minh luôn đang chạy |
| `S` | Chờ có thể bị đánh thức/ngắt | Ví dụ `sleep` chờ thời gian; không đồng nghĩa bị lỗi |
| `D` | Chờ không ngắt được theo cơ chế chờ thông thường | Thường liên quan chờ trong kernel; cần tìm nơi chờ |
| `T` | Bị dừng | Có thể do STOP hoặc thao tác điều khiển công việc |
| `t` | Dừng do theo dõi/gỡ lỗi | Phân biệt với dừng điều khiển công việc |
| `Z` | Đã kết thúc, còn chờ thu hồi | Kiểm tra cha và việc chờ con |

**Wait channel — vị trí chờ** là tên vị trí/hàm kernel nơi task đang ngủ, giúp định hướng điều tra. Ví dụ:

```bash
ps -p "$lab_pid" -o pid,ppid,stat,wchan:24,etime,args
```

Chỉ dùng khi `lab_pid` còn trỏ đến tiến trình lab đang sống. `ETIME` là thời gian từ khi bắt đầu, không phải thời gian CPU đã dùng. `WCHAN` có thể là `-`, `0` hoặc bị hạn chế hiển thị; không suy ra rằng không có chờ. **Permission — quyền truy cập** là quy tắc hệ thống quyết định bạn được xem hoặc tác động tài nguyên nào; ví dụ có thể xem `ps` nhưng không đọc được stack kernel của tiến trình khác. **Stack kernel** ở đây là dấu vết các hàm kernel đang thực hiện, khác với việc xem toàn bộ dữ liệu stack của ứng dụng. Khi được phép, `/proc/PID/stack` hỗ trợ điều tra sâu hơn; `PID` trong đường dẫn là ký hiệu thay thế, phải đổi thành mã tiến trình thật, ví dụ `/proc/24110/stack`. Có thể gặp `Permission denied` dù xem được `ps`, do kernel giới hạn việc đọc dấu vết này.

Một `D` kéo dài không tự chứng minh ổ đĩa hỏng: cần kết hợp nơi chờ, thông tin thiết bị và diễn biến theo thời gian. KILL cũng có thể chưa làm task biến mất khi nó chưa ra khỏi đường chờ kernel phù hợp. Không cố tạo trạng thái D bằng cách gây lỗi thiết bị trong lab này. Nguồn mô tả các cột và trạng thái: [ps(1)](https://man7.org/linux/man-pages/man1/ps.1.html).

## 5. Signal là yêu cầu gì và ai xử lý?

**Signal — tín hiệu** là thông báo sự kiện gửi đến tiến trình hoặc luồng, như yêu cầu kết thúc hay thông báo thao tác từ terminal. `kill` là công cụ gửi signal; tên của nó không có nghĩa mọi signal đều làm chết tiến trình.

**Action — cách xử lý — mặc định** là cách hệ thống xử lý khi chương trình không thiết lập cách xử lý khác. **Handler — hàm xử lý tín hiệu** là phần ứng dụng đăng ký để phản ứng, ví dụ đánh dấu rằng cần ngừng nhận dữ liệu. **Bỏ qua** nghĩa là nhận mà không thực hiện phản ứng đó. **Chặn signal** là trì hoãn việc giao; tín hiệu có thể ở trạng thái **pending — đang chờ giao**, không giống bỏ qua.

Để thấy vị trí của ứng dụng trong cơ chế này, đọc sơ đồ từ trên xuống rồi đi theo các nhánh cuối:

```text
Bạn / terminal / sự kiện kernel
                 │ tạo signal
                 v
          Kernel kiểm tra và ghi nhận
                 │ có thể chờ nếu bị chặn
                 v
          Giao signal khi đủ điều kiện
                 ├── Action mặc định: kết thúc / dừng / tiếp tục / bỏ qua
                 ├── Đã đặt bỏ qua: không chạy handler
                 └── Handler ứng dụng: đánh dấu yêu cầu, xử lý tiếp
```

Mũi tên là các giai đoạn từ phát sinh đến giao, không phải cam kết xử lý ngay lập tức. Nhánh handler thể hiện mã ứng dụng chạy để phản ứng; kernel không tự biết phải lưu bản ghi cảm biến nào. KILL và STOP là ngoại lệ không cho ứng dụng đổi cách xử lý.

Các tín hiệu cần dùng trước tiên:

| Signal | Hành vi chính | Khi nào dùng |
|---|---|---|
| `SIGTERM` | Mặc định kết thúc; ứng dụng có thể xử lý | Yêu cầu thoát bình thường, cho ứng dụng cơ hội dọn dẹp |
| `SIGINT` | Mặc định kết thúc; có thể xử lý | Thường do Ctrl+C |
| `SIGSTOP` | Dừng, không thể bắt/bỏ qua/chặn | Tạm dừng để quan sát |
| `SIGCONT` | Tiếp tục tiến trình đã dừng | Cho tiến trình chạy tiếp |
| `SIGKILL` | Kết thúc, không thể bắt/bỏ qua/chặn | Khi cần buộc kết thúc, chấp nhận mất dọn dẹp ứng dụng |

Dọn dẹp là việc ứng dụng chủ động hoàn tất, như lưu dữ liệu hoặc kết thúc giao dịch. TERM **cho cơ hội**, không bảo đảm ứng dụng có handler hay sẽ thoát nhanh. KILL vẫn khiến kernel thu hồi tài nguyên của tiến trình khi nó kết thúc, nhưng không chạy mã lưu dữ liệu của ứng dụng. Nguồn: [signal(7)](https://man7.org/linux/man-pages/man7/signal.7.html).

### 5.1. Từ lệnh `kill` đến kết quả nhìn thấy

Với `kill -TERM "$lab_pid"`, Bash gửi yêu cầu tới kernel, kernel kiểm tra đối tượng và quyền gửi, rồi tổ chức giao tín hiệu. Ứng dụng có thể phản ứng sau đó. Lệnh gửi thành công không đồng nghĩa việc dọn dẹp đã hoàn tất; dùng `wait` để chờ con kết thúc và kiểm tra kết quả.

Trong lab chỉ dùng PID dương vừa tạo. PID 0 hoặc PID âm có ý nghĩa gửi đến nhóm/nhiều tiến trình, không phải giá trị thay thế khi chưa biết PID. **Nhóm tiến trình** là tập hợp tiến trình dùng cho điều khiển công việc, ví dụ nhiều lệnh trong cùng một chuỗi nối đầu ra với đầu vào. `kill -0 PID` không gửi tín hiệu thực; nó kiểm tra sự tồn tại và quyền gửi. Thành công không chứng minh ứng dụng khỏe hay đang xử lý dữ liệu. Nguồn: [kill(2)](https://man7.org/linux/man-pages/man2/kill.2.html).

PID có thể được dùng lại sau khi đối tượng cũ biến mất. Kiểm tra bằng `ps` ngay trước thao tác giảm nhầm lẫn trong lab, nhưng không loại bỏ hoàn toàn khoảng thời gian giữa kiểm tra và gửi. Phần mềm quản lý tiến trình lâu dài cần cơ chế nhận diện chắc chắn hơn. Chẳng hạn **pidfd — descriptor tham chiếu tới một đối tượng tiến trình** cho phép giữ tham chiếu gắn với đối tượng đó để thao tác, thay vì chỉ giữ số PID có thể tái sử dụng; giao diện này phụ thuộc hỗ trợ kernel và công cụ. Xem [pidfd_open(2)](https://man7.org/linux/man-pages/man2/pidfd_open.2.html); không coi một số PID lưu từ hôm qua là danh tính vĩnh viễn.

### 5.2. Ctrl+C, Ctrl+Z, `jobs` khác `ps` ở đâu?

**Foreground — công việc tiền cảnh** là công việc đang được terminal cho tương tác trực tiếp; **background — công việc nền** cho phép shell tiếp tục nhận lệnh. **Job — công việc do shell quản lý** có thể gồm một hoặc nhiều tiến trình. Khi điều khiển công việc hoạt động trong Bash tương tác, Ctrl+C thường gửi INT tới nhóm tiền cảnh; Ctrl+Z thường gửi TSTP, một signal dừng có thể được xử lý, khác STOP không thể xử lý.

```bash
sleep 300
# Nhấn Ctrl+Z để trở lại dấu nhắc
jobs -l
bg %1
fg %1
# Nhấn Ctrl+C khi sleep ở tiền cảnh
```

`%1` là số job minh họa: dùng số thực từ `jobs`, đừng mặc định luôn là 1. `bg` tiếp tục ở nền; `fg` đưa về tiền cảnh. `jobs` chỉ biết công việc của shell hiện tại. Mở terminal khác có thể thấy `sleep` bằng `ps` nhưng không có job tương ứng để `fg`. Job control có thể không được bật trong script hoặc môi trường không có terminal tương tác. Đối chiếu `help jobs`, `help bg`, `help fg` trên Bash và [GNU Bash: Job Control](https://www.gnu.org/software/bash/manual/html_node/Job-Control.html).

### 5.3. Giới hạn khi viết handler

Ví dụ Python ở dưới là minh họa ngừng vòng lặp. **Bộ thông dịch Python** là chương trình thực hiện mã Python của bạn; vì vậy ngoài cơ chế signal của Linux còn có cách Python chuyển sự kiện thành lời gọi hàm Python. Python thực hiện handler trong luồng chính, tại các điểm kiểm tra của bộ thông dịch; công việc kéo dài trong mã mở rộng có thể trì hoãn phản ứng. Không suy rộng cách Python xử lý sang C. Handler C chạy trong ngữ cảnh bất đồng bộ, nghĩa là có thể chen vào công việc đang làm; nhiều hàm thông thường không an toàn để gọi ở đó. Khi học lập trình hệ thống, đọc [signal-safety(7)](https://man7.org/linux/man-pages/man7/signal-safety.7.html) trước khi đưa thao tác phức tạp vào handler.

Với nhiều luồng, cách xử lý signal là thuộc tính chung của tiến trình nhưng bộ signal bị chặn có thể khác theo luồng. Signal gửi tới tiến trình không có nghĩa mọi luồng đều chạy handler. Các signal thông thường cũng không phải hàng đợi đếm sự kiện đáng tin cậy: nhiều lần cùng loại đang pending có thể gộp lại. Dùng cơ chế giao tiếp thích hợp nếu mỗi sự kiện phải được ghi nhận.

## 6. Chuẩn bị và quy tắc đọc lab

Chạy các lab trong cùng một Bash tương tác thông thường, không bật `set -e` (chế độ có thể khiến shell/script thoát khi gặp mã lỗi); `wait` sau khi con bị signal thường trả mã khác 0 có chủ đích. Các lab không sửa cấu hình hệ thống. Tạo thư mục chứa mã thử bằng:

```bash
mkdir -p ~/linux-lab
bash --version
ps --version
python3 --version
```

`mkdir -p` tạo thư mục nếu chưa có. Các lệnh phiên bản xác nhận công cụ có thể gọi được, không xác nhận bất kỳ ứng dụng lab nào đang chạy. Nếu Python chưa có hoặc `ps` thiếu tùy chọn, bổ sung công cụ theo distro trước khi tiếp tục; không sao chép lệnh cài của distro khác.

Các file lab bên dưới là file người học tự tạo trong `~/linux-lab`, không phải file bài học có sẵn. Nếu đã có file cùng tên chứa việc của bạn, chọn tên khác và sửa đường dẫn tương ứng.

## 7. Lab 1 — Quan sát, dừng, tiếp tục và kết thúc

### Bước 1: tạo đúng một đối tượng để điều khiển

```bash
sleep 300 &
lab_pid=$!
printf 'lab PID=%s\n' "$lab_pid"
ps -p "$lab_pid" -o pid,ppid,stat,etime,args
jobs -l
```

Đối chiếu PID trong `ps` và `jobs`; `ARGS` phải là `sleep 300`. Thường thấy `S` vì chương trình đang chờ thời gian. Nếu chỉ thấy tiêu đề, tiến trình đã thoát hoặc PID không còn đúng; tạo lại và lưu `$!` ngay, không gửi signal đến số đoán.

### Bước 2: dừng và xác nhận

```bash
kill -STOP "$lab_pid"
sleep 0.2
ps -p "$lab_pid" -o pid,stat,args
```

Kỳ vọng chữ đầu của `STAT` là `T`. Việc chờ ngắn để thuận tiện quan sát, không là cam kết thời gian giao tín hiệu. Nếu chưa thấy `T`, kiểm tra lại PID và đọc lại. Dừng giữ tiến trình tồn tại; nó chưa kết thúc và chưa trả kết quả cuối cho cha.

### Bước 3: tiếp tục rồi kết thúc

```bash
kill -CONT "$lab_pid"
sleep 0.2
ps -p "$lab_pid" -o pid,stat,args
kill -TERM "$lab_pid"
wait "$lab_pid"
lab_status=$?
printf 'status=%s\n' "$lab_status"
ps -p "$lab_pid" -o pid,stat,args
```

Sau CONT, thường lại thấy `S`. `sleep` không cài handler dọn dẹp như chương trình ở lab 2 nên TERM kết thúc nó theo mặc định. Lệnh Bash `wait` chờ con và trả kết quả mà Bash lưu cho công việc đó. Khi job control được bật, `wait` thông thường có thể trở lại khi công việc thay đổi trạng thái, chẳng hạn bị dừng; `wait -f "$lab_pid"` yêu cầu chờ kết thúc thực sự trên Bash hỗ trợ tùy chọn `-f`. Lab đã CONT và không gửi STOP thêm nên dùng `wait` thông thường; `$?` lấy mã của lệnh vừa xong, nên phải lưu ngay trước khi chạy `printf` hoặc `ps`.

Bash biểu diễn kết thúc do signal số N bằng `128 + N`. Trên nhiều máy Linux, TERM là 15 nên thấy 143; xác định bằng `kill -l TERM` thay vì mặc định số trên mọi kiến trúc. Đây là quy ước Bash, không phải giá trị nguyên thô mà mọi API `wait` trả về. Trong C, kết quả phải được giải mã bằng các phép kiểm tra như `WIFSIGNALED` và `WTERMSIG`. Nguồn đối chiếu: [GNU Bash: Exit Status](https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html), [wait(2)](https://man7.org/linux/man-pages/man2/wait.2.html).

`ps` cuối thường chỉ còn tiêu đề: đối tượng đã biến mất trong thời điểm kiểm tra. Bash có thể đã thu hồi con từ trước, vẫn giữ kết quả để lệnh `wait` lấy lại; vì vậy lab này không nhất thiết cho bạn nhìn thấy zombie.

## 8. Lab 2 — TERM cho cơ hội dọn dẹp, KILL bỏ qua mã ứng dụng

Lưu nội dung sau thành `~/linux-lab/signals.py`:

```python
import os
import signal
import time

running = True

def stop(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, stop)
print(f"ready pid={os.getpid()}", flush=True)
try:
    while running:
        time.sleep(0.2)
finally:
    print("cleanup complete", flush=True)
```

`import` nạp các **module — nhóm chức năng Python**, chẳng hạn module `signal` chứa giao diện đăng ký xử lý tín hiệu. Biến `running` lưu cờ đúng/sai điều khiển vòng lặp; `global` cho hàm `stop` sửa biến ở cấp chương trình thay vì tạo biến riêng trong hàm. `os.getpid()` lấy PID hiện tại. `signal.signal` đăng ký hàm `stop` cho TERM; `signum` là số tín hiệu được nhận, còn `frame` mô tả điểm mã Python bị ngắt. Lab không cần dùng hai tham số này. Khi Python gọi hàm đó, nó chỉ đổi cờ `running`; vòng lặp thấy cờ sai sẽ kết thúc và đi qua `finally`, phần chạy khi rời khối `try` theo luồng thực thi Python. `flush=True` yêu cầu đẩy chữ ra ngay để dễ quan sát mốc sẵn sàng. Đây là mô phỏng dọn dẹp bằng một dòng chữ, không chứng minh dữ liệu thực tế đã được ghi an toàn.

### Thử TERM

```bash
python3 ~/linux-lab/signals.py &
app_pid=$!
```

**Chờ nhìn thấy `ready pid=...` rồi mới chạy tiếp.** Nếu gửi TERM trước khi đăng ký handler, kết quả không còn kiểm chứng cơ chế mong muốn.

```bash
ps -p "$app_pid" -o pid,stat,args
kill -TERM "$app_pid"
wait "$app_pid"
app_status=$?
printf 'status=%s\n' "$app_status"
```

Kỳ vọng thấy `cleanup complete` và mã 0. Lý do: TERM được handler tiếp nhận, ứng dụng tự rời vòng lặp bình thường, chứ không bị kết thúc theo action mặc định. Vì thế “đã gửi TERM” không luôn dẫn đến 143. Vòng lặp chờ ngắn nên thường phản ứng nhanh, nhưng không phải cam kết thời gian cho mọi ứng dụng.

### Thử KILL trên một lần chạy mới

```bash
python3 ~/linux-lab/signals.py &
app_pid=$!
```

Chờ dòng `ready`, kiểm tra rồi gửi:

```bash
ps -p "$app_pid" -o pid,stat,args
kill -KILL "$app_pid"
wait "$app_pid"
app_status=$?
printf 'status=%s\n' "$app_status"
```

Kỳ vọng không có `cleanup complete` từ lần chạy này; trên máy có KILL số 9, Bash thường trả 137. Không có handler nào cứu được việc dọn dẹp trong Python sau KILL. `finally` cũng không là bảo đảm chống mất điện hay sự cố làm chương trình không thể tiếp tục. Với hệ thu thập dữ liệu thật, phải thiết kế việc lưu dữ liệu định kỳ và phục hồi sau gián đoạn. Nguồn về hành vi Python: [tài liệu module signal](https://docs.python.org/3/library/signal.html).

## 9. Lab 3 — Một PID có thể chứa nhiều luồng

Lưu thành `~/linux-lab/threads.py`:

```python
import os
import threading
import time

def worker():
    print(f"worker native TID={threading.get_native_id()}", flush=True)
    time.sleep(30)

threads = [threading.Thread(target=worker) for _ in range(2)]
for thread in threads:
    thread.start()
print(f"ready PID={os.getpid()}", flush=True)
for thread in threads:
    thread.join()
```

`threading.Thread` tạo luồng chạy hàm `worker`; `start` cho nó bắt đầu; `join` chờ luồng hoàn tất. Luồng chính cùng hai worker thường tạo tổng cộng ba luồng. `get_native_id()` có trên Python từ 3.8 và trả mã luồng của hệ điều hành; nếu máy cũ hơn, bỏ phần in TID và vẫn dùng `ps` để quan sát.

```bash
python3 ~/linux-lab/threads.py &
thread_pid=$!
# Chờ dòng ready rồi chạy ngay trong khoảng 30 giây
ps -L -p "$thread_pid" -o pid,lwp,nlwp,stat,comm
cat "/proc/$thread_pid/status"
wait "$thread_pid"
```

Trong `ps`, `LWP` là mã task/luồng Linux; `NLWP` là số luồng của tiến trình. Kỳ vọng ba dòng cùng PID nhưng LWP khác nhau, một LWP bằng PID. Trong `status`, tìm `Threads:` để đối chiếu số lượng; `Tgid` là mã nhóm, `Pid` ở file cấp tiến trình thường là mã luồng chính. Thứ tự các dòng in của worker có thể khác do thứ tự được chạy không cố định. Tài liệu các trường: [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html).

Có thể dùng `top -H -p "$thread_pid"` khi nó còn sống: `top` cập nhật liên tục, `-H` hiển thị luồng, nhấn `q` để thoát công cụ. `COMM` trong `ps` là tên ngắn của task; cùng tên `python3` ở nhiều dòng không có nghĩa đây là cùng một luồng. Ví dụ này chỉ xác nhận cấu trúc luồng; hai worker chủ yếu ngủ, nên không kiểm chứng hiệu năng tính toán song song. Với Python, khả năng thực hiện mã Python đồng thời còn phụ thuộc bản triển khai và cấu hình; không rút kết luận từ số dòng `ps`.

## 10. Lab 4 — Nhìn thấy zombie rồi thu hồi nó

Lab này cố tình cho cha chậm thu hồi con khoảng 20 giây, sau đó tự dọn. Không cần gửi KILL. Lưu thành `~/linux-lab/zombie.py`:

```python
import os
import time

child_pid = os.fork()
if child_pid == 0:
    os._exit(7)

print(f"parent={os.getpid()} child={child_pid}", flush=True)
time.sleep(20)
waited_pid, status = os.waitpid(child_pid, 0)
print(f"reaped={waited_pid} exit={os.waitstatus_to_exitcode(status)}",
      flush=True)
```

`os.fork()` là giao diện Python cho việc tạo con trên hệ Unix. Con gọi `os._exit(7)` để kết thúc ngay với mã 7; cách thoát này bỏ qua dọn dẹp cấp Python và chỉ dùng để giữ ví dụ tối giản. Cha ngủ để bạn kịp xem rồi gọi `os.waitpid`: tham số 0 ở đây là tùy chọn chờ bình thường, **không phải PID 0**. `waitstatus_to_exitcode` giải mã trạng thái API, có từ Python 3.9.

```bash
python3 ~/linux-lab/zombie.py &
zombie_parent=$!
```

Đọc dòng `parent=... child=...`, lấy **PID con thực tế** để xem trong khoảng 20 giây. Ví dụ nếu dòng in có `child=25101` thì chạy:

```bash
ps -p 25101 -o pid,ppid,stat,args
```

Kỳ vọng `Z` và có thể có chữ `<defunct>`, chỉ tiến trình đã kết thúc. PPID khớp cha vừa in. Sau khoảng 20 giây, chương trình in `reaped=... exit=7`. Kiểm tra lại đúng PID con rồi chờ cha:

```bash
ps -p 25101 -o pid,ppid,stat,args
wait "$zombie_parent"
printf 'parent status=%s\n' "$?"
```

Thay 25101 bằng PID bạn thực sự quan sát. Sau thu hồi, thường không còn dòng con; cha thoát bình thường với 0 dù con thoát 7. Cha và con có kết quả riêng, không tự truyền mã con thành mã cha. Nếu bạn kiểm tra quá muộn, không thấy Z là đúng vì đã được thu hồi. Nếu môi trường có chính sách không giữ zombie, hoặc hạn chế `fork`, kết quả cũng có thể khác; đọc lỗi và đối chiếu môi trường thay vì coi đầu ra mẫu là bắt buộc.

Lab chứng minh “con chết” và “cha nhận kết quả” là hai thời điểm. Nó không tạo orphan; muốn chẩn đoán orphan trên hệ thật cần theo dõi PPID trước/sau khi cha thoát, đồng thời xác định phạm vi PID và cơ chế nhận nuôi, không chỉ tìm PPID bằng 1.

### 10.1. Thử thêm: con sửa dữ liệu, cha có bị đổi theo không?

Để nối quan hệ cha/con với bộ nhớ riêng, lưu thành `~/linux-lab/fork-data.py` rồi chạy `python3 ~/linux-lab/fork-data.py`. Chương trình một luồng này chỉ tạo một con, chờ thu hồi và tự kết thúc:

```python
import os

value = 10
print(f"before fork: pid={os.getpid()} value={value}", flush=True)
child_pid = os.fork()
if child_pid == 0:
    value = 20
    print(f"child: pid={os.getpid()} ppid={os.getppid()} value={value}",
          flush=True)
    os._exit(0)

os.waitpid(child_pid, 0)
print(f"parent: pid={os.getpid()} value={value}", flush=True)
```

Đọc ba dòng theo thứ tự: trước fork có giá trị 10; con có PID mới, PPID bằng PID cha và đổi giá trị thành 20; sau khi chờ con, cha vẫn thấy 10. Việc chờ trước khi cha in kết quả làm thứ tự dễ đối chiếu. Nó xác nhận dữ liệu thông thường không tự chia sẻ sau fork, **không đo trực tiếp việc sao chép trang vật lý**: Python còn quản lý đối tượng và làm nhiều thao tác bộ nhớ khác. Bài 17 sẽ giải thích sâu hơn copy-on-write và cách đo bộ nhớ.

Không đưa ví dụ `os.fork()` này vào ứng dụng nhiều luồng rồi suy ra vẫn an toàn. Khi fork từ tiến trình nhiều luồng, con chỉ giữ luồng gọi fork; dữ liệu về khóa có thể được kế thừa trong khi luồng giữ khóa không tồn tại ở con. **Khóa — cơ chế giới hạn ai được sửa tài nguyên tại một thời điểm**, ví dụ buộc một luồng hoàn tất cập nhật trước khi luồng khác vào. Nếu trạng thái khóa không phù hợp, con có thể chờ mãi. Thiết kế fork/exec trong ứng dụng nhiều luồng cần tuân thủ quy tắc của thư viện và kernel; lab cố ý dùng chương trình một luồng.

### 10.2. Khi gặp zombie ngoài lab, nên kiểm tra theo thứ tự nào?

Trước hết, ghi đúng PID zombie và đọc `PPID` bằng `ps -p PID -o pid,ppid,stat,args`, thay `PID` bằng số thực. Sau đó xem cha bằng `ps -p PPID -o pid,ppid,stat,args`, thay `PPID` bằng số vừa đọc. Quan sát lại sau một khoảng thời gian để phân biệt zombie thoáng qua với tích tụ kéo dài. Nếu cha đang xử lý hàng nghìn con, một lần chụp thấy Z chưa đủ kết luận nó bỏ quên việc thu hồi.

**Log — bản ghi sự kiện của ứng dụng/hệ thống** giúp biết cha gặp lỗi gì, chẳng hạn thông báo tạo con hoặc chờ con thất bại. Tìm log của ứng dụng cha hoặc dùng công cụ tracing phù hợp khi có quyền; tracing là quan sát các thao tác thực thi để kiểm chứng cơ chế, được học ở bài 16. Nếu cha không thu hồi con, sửa vòng chờ/thiết kế ứng dụng hoặc xử lý qua cơ chế quản lý dịch vụ của nó sau khi hiểu tác động. Không có một lệnh KILL vào zombie thay thế được công việc này. Những lab ở bài chỉ tạo zombie ngắn hạn và đã tự thu hồi.

## 11. Lỗi thường gặp và cách kiểm tra lại

| Hiện tượng hoặc suy luận | Giải thích và bước kiểm tra |
|---|---|
| `kill: No such process` | Tiến trình có thể đã thoát, PID sai hoặc không thấy trong phạm vi hiện tại. Kiểm tra PID và `ps`, không thử số khác ngẫu nhiên. |
| `Operation not permitted` | Không có quyền gửi signal. Trong lab phải chọn con do bạn tạo; đừng tự thêm quyền quản trị để tác động tiến trình khác. |
| TERM gửi thành công nhưng chương trình còn | Có thể bị chặn, được xử lý nhưng chưa thoát, hoặc dọn dẹp đang chờ. Xem trạng thái, log và tiến triển; thành công của `kill` chưa xác nhận shutdown. |
| STOP xong rồi TERM nhưng không thấy dọn dẹp | Tiến trình đang dừng không chạy mã handler như bình thường; trong thử nghiệm hãy CONT rồi TERM để nó có cơ hội xử lý. |
| KILL rồi vẫn thấy `Z` | Nó đã chết, còn cần cha/reaper thu hồi. Kiểm tra PPID và hành vi chờ con. |
| KILL rồi còn `D` | Có thể chưa thoát đường chờ kernel. Điều tra nơi chờ và tài nguyên liên quan, không gửi lặp KILL như một cách sửa nguyên nhân. |
| `wait: ... not a child` | `wait` của Bash dùng cho con/job của shell đó, không chờ tùy ý một PID từ terminal khác. Chạy trong shell đã khởi tạo lab. |
| `jobs` trống nhưng `ps` có tiến trình | Hai công cụ có phạm vi khác nhau; `jobs` không phải danh sách toàn hệ thống. |
| `$?` bằng 0 dù trước đó `wait` lỗi | Bạn đã chạy lệnh khác trước khi lấy `$?`. Lưu ngay `status=$?`. |
| Nhiều luồng nên chắc chắn dùng nhiều lõi hiệu quả | Chưa đủ bằng chứng: xem mức dùng CPU từng luồng và đo công việc thực; luồng có thể chờ hoặc tranh chấp dữ liệu. |
| Tìm tên chương trình rồi gửi signal hàng loạt | Cùng tên có thể là nhiều lần chạy với mục đích khác. Lab dùng PID mới tạo và đối chiếu `ARGS`. |

## 12. Tự kiểm tra: áp dụng mô hình vào tình huống mới

1. Có `/usr/bin/python3` và `python3 --version` chạy được. Bạn có kết luận chương trình thu thập dữ liệu đang chạy không? **Tiêu chí:** phân biệt file/công cụ có sẵn với một lần thực thi; cần quan sát tiến trình và dấu hiệu ứng dụng hoạt động.
2. `ps -L` có bốn dòng cùng PID. Có bốn tiến trình độc lập không? **Tiêu chí:** nhận diện cùng nhóm tiến trình, TID riêng và tài nguyên chia sẻ; số luồng không xác nhận bốn lõi đều bận.
3. Một Bash con exec thành `sleep`; tên lệnh đổi nhưng PID giữ nguyên. Vì sao? **Tiêu chí:** exec thay chương trình, fork mới tạo con có PID mới.
4. Một con là Z, cha vẫn sống. Gửi KILL vào con có thu hồi nó không? **Tiêu chí:** con không còn chạy; tìm việc wait/thu hồi ở cha, tránh giết cha tùy tiện.
5. TERM vào ứng dụng lab trả 0 nhưng TERM vào `sleep` trả 143 trên máy có TERM số 15. Hai kết quả có mâu thuẫn không? **Tiêu chí:** một bên xử lý rồi tự thoát, bên kia bị signal kết thúc; phân biệt quy ước Bash với trạng thái API.
6. Tiến trình D kéo dài và `wchan` bị ẩn. Có đủ bằng chứng kết luận ổ hỏng không? **Tiêu chí:** chưa; cần dữ liệu bổ sung và quyền quan sát thích hợp.
7. Bạn đổi sang terminal khác, `ps` còn thấy công việc nhưng `fg` không tìm thấy. Giải thích thế nào? **Tiêu chí:** job thuộc shell tạo nó, không thuộc mọi terminal.
8. Con thoát 7, chương trình cha nhận kết quả rồi thoát 0. Script chờ cha nên nhận mã nào? **Tiêu chí:** nhận mã cha; cha phải chủ động quyết định có truyền lỗi con ra ngoài hay không.

Bài tập tổng hợp: chạy lại lab 2, ghi PID, trạng thái trước TERM, dòng dọn dẹp, kết quả `wait` và kết quả `ps` cuối. Sau đó thử KILL trên lần chạy mới. Tự đối chiếu được cả **đã gửi yêu cầu → ứng dụng phản ứng thế nào → đã kết thúc chưa → ai lấy kết quả** là đạt, không chỉ nhớ các số 143 và 137.

## 13. Tóm tắt mô hình cần nhớ

Chương trình là chỉ dẫn; tiến trình là một lần thực thi có tài nguyên và danh tính. Luồng là đường thực thi trong tiến trình; kernel lập lịch từng task, còn số luồng không tự chứng minh hiệu năng. `fork` tạo con, `exec` đổi chương trình trong đối tượng đang có, `wait` nhận và thu hồi kết quả con.

`R/S/D/T/Z` giúp đặt câu hỏi tiếp theo, không thay thế việc điều tra. Zombie đã kết thúc; orphan mất cha ban đầu. Signal là thông báo có cách xử lý; TERM cho ứng dụng cơ hội thoát sạch, KILL không chạy mã dọn dẹp. Gửi thành công và kết thúc thành công là hai điều phải kiểm chứng riêng.

Bài shell scripting kế tiếp sẽ dùng những quan hệ này để chạy công việc nền, lưu PID và xử lý mã kết thúc đúng thời điểm.

## Nguồn và cách đọc thêm

Các nguồn được đối chiếu khi biên soạn ngày 27-09-2026; tài liệu trực tuyến có thể mô tả bản công cụ mới hơn máy bạn. Ưu tiên thêm `man`/`help` của bản đã cài nếu cú pháp khác. `man` là công cụ đọc tài liệu tại máy: số 1 chỉ lệnh người dùng, 2 chỉ system call, 7 chỉ bài tổng quan.

- [Linux man-pages: fork(2)](https://man7.org/linux/man-pages/man2/fork.2.html), [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html), [wait(2)](https://man7.org/linux/man-pages/man2/wait.2.html): vòng đời tiến trình.
- [pthreads(7)](https://man7.org/linux/man-pages/man7/pthreads.7.html), [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html): luồng và thông tin kiểm tra.
- [signal(7)](https://man7.org/linux/man-pages/man7/signal.7.html), [kill(2)](https://man7.org/linux/man-pages/man2/kill.2.html), [signal-safety(7)](https://man7.org/linux/man-pages/man7/signal-safety.7.html): giao và xử lý tín hiệu.
- [ps(1), tài liệu procps-ng](https://man7.org/linux/man-pages/man1/ps.1.html): tùy chọn và trạng thái; tại máy dùng `man ps`.
- [GNU Bash: Job Control](https://www.gnu.org/software/bash/manual/html_node/Job-Control.html), [Exit Status](https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html): tại máy xem `help wait`, `help kill`, `help jobs` và `man bash`.
- [Python signal](https://docs.python.org/3/library/signal.html), [threading](https://docs.python.org/3/library/threading.html), [os](https://docs.python.org/3/library/os.html): đối chiếu giao diện Python và giới hạn theo phiên bản.
