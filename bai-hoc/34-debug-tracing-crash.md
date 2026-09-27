# Bài 34 — Debugging, tracing và phân tích crash

[Mục lục](../README.md) · [← Bài 33](33-io-network-performance.md) · [Bài 35 →](35-dong-thoi-va-khoa.md)

## Mục tiêu: chọn công cụ theo câu hỏi cần trả lời

Một chương trình thu thập dữ liệu bỗng dừng: nó đang chờ file, dùng hết CPU, chờ một khóa hay đã crash? “Chạy lại cho hết lỗi” không giữ được bằng chứng. Ngược lại, bật mọi công cụ cùng lúc có thể thay đổi thời gian chạy và khiến lỗi biến mất.

Bài này đi từ câu hỏi đến phép đo: syscall nào thất bại, CPU dành cho phần nào, luồng chờ ở đâu và trạng thái lúc dừng ra sao. Nên đã học bài 16, 31–33 và C cơ bản. Lab chỉ chạy chương trình nhỏ do chính bạn tạo, không gây lỗi kernel, không attach vào dịch vụ của người khác và không hạ chính sách bảo vệ host.

Sau bài, bạn cần đọc một trace lỗi file, backtrace có biến/dòng nguồn, phân biệt sampling với thời gian chờ, biết giới hạn core dump và mô tả được oops/panic/kdump mà không cần gây panic thật.

## 1. Debug, trace và profile nhìn những lớp nào?

**Process — tiến trình** là một lần chương trình đang chạy, có mã **PID** và tài nguyên riêng do hệ thống quản lý. **Thread — luồng thực thi** là một dòng công việc bên trong process; các thread cùng process thường chia sẻ bộ nhớ. **Kernel — nhân hệ điều hành** quản lý CPU, bộ nhớ và tài nguyên; **user space — không gian ứng dụng** là nơi chương trình C/Python của bạn chạy.

**Debugging — gỡ lỗi** là kiểm tra trạng thái và điều khiển thực thi để tìm vì sao hành vi khác mong đợi. **Debugger — công cụ gỡ lỗi**, ví dụ GDB, có thể dừng chương trình, xem biến hoặc chạy từng bước. **Tracing — ghi dấu vết sự kiện** ghi điều gì xảy ra theo thời gian, như syscall mở file thất bại. **Profiling — lập hồ sơ hoạt động** thu thống kê để biết thời gian/tài nguyên tập trung ở đâu, thường bằng lấy mẫu. Ba cách có thể phối hợp, nhưng không trả lời cùng một câu hỏi.

**System call — lời gọi hệ thống**, viết **syscall**, là yêu cầu ứng dụng gửi kernel, ví dụ `openat` mở file. `strace` ghi syscall/signal của process; nó không ghi mọi hàm C hay mọi truy cập bộ nhớ. **Signal — tín hiệu** là thông báo sự kiện/điều khiển, ví dụ SIGABRT ở lab. Một hàm đang tính toán trong user space có thể dùng CPU cao mà không có nhiều syscall. Xem [strace(1)](https://man7.org/linux/man-pages/man1/strace.1.html).

**Sample — mẫu quan sát** là trạng thái ghi lại khi công cụ lấy mẫu; `perf` có thể đếm sự kiện và ghi mẫu CPU. **On-CPU** là lúc task đang được CPU thực hiện; **off-CPU** là khoảng task không chạy trên CPU, có thể do chờ dữ liệu, chờ khóa hoặc chưa được lập lịch. **Task** là đơn vị thực thi kernel quản lý, thường tương ứng thread Linux. Hồ sơ CPU chủ yếu thấy on-CPU không tự giải thích mọi giây ứng dụng chậm ngoài đời.

Bảng dưới chọn điểm bắt đầu, không là công thức một công cụ chẩn đoán mọi nguyên nhân:

| Câu hỏi | Công cụ/nguồn phù hợp | Điều chưa được kết luận |
|---|---|---|
| Mở file/socket nào thất bại? | `strace`, mã lỗi, log | Không thấy toàn bộ xử lý trong ứng dụng |
| CPU được dùng ở hàm nào? | `perf` sampling, symbol | Không đo đầy đủ thời gian off-CPU |
| Thread chờ ở đâu? | `ps` trạng thái/wchan, GDB các thread, tracing chờ khi phù hợp | Một ảnh chụp chưa chứng minh deadlock |
| Crash với biến và đường gọi nào? | GDB, core và binary khớp | Điểm dừng chưa chắc là nguyên nhân gốc |
| Sự kiện/hàm kernel nào diễn ra? | ftrace hoặc công cụ eBPF được cấu hình đúng | Cần quyền, hỗ trợ và đánh giá tác động |

## 2. Địa chỉ máy biến thành tên hàm và dòng nguồn thế nào?

**Executable/binary — file chương trình thực thi** chứa mã mà hệ thống nạp chạy. **Symbol — tên gắn với vị trí mã/dữ liệu** giúp đổi địa chỉ thành tên như `process_request`. **Debug information — thông tin gỡ lỗi** mô tả dòng nguồn, kiểu và biến để debugger liên hệ mã máy với C. **Build — một lần/quy trình tạo binary** bao gồm source, tùy chọn compiler và thư viện; **compiler — trình biên dịch** như GCC chuyển source thành mã máy.

`gcc -g` tạo thông tin gỡ lỗi cho lab; `-O0` giảm tối ưu để dễ đối chiếu. **Optimization — tối ưu** có thể **inline — đưa nội dung hàm vào chỗ gọi**, bỏ biến không cần và đổi cách tổ chức lời gọi. GDB hiển thị `<optimized out>` không tự nghĩa biến trong source bị lỗi, mà có thể không còn vị trí lưu giá trị để xem. Không suy số frame luôn bằng số hàm source đã đi qua. Xem [GDB và mã tối ưu](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html).

Binary, thư viện và debug info phải khớp **build thật lúc lỗi**. Cùng tên file/cùng version ứng dụng chưa bảo đảm khớp compiler option hoặc bản vá. **Build ID — mã nhận dạng build** nếu ELF có là cách hỗ trợ tìm đúng bộ symbol; **ELF** là định dạng binary phổ biến của Linux. `readelf -n ./crash-lab` đọc ghi chú ELF, trong đó có thể có Build ID; không tự chứng minh bộ thư viện đã khớp.

Giữ binary/source lab khi đọc core, không biên dịch ghi đè rồi mở core cũ với file mới. **Core file/core dump — ảnh trạng thái bộ nhớ và thanh ghi của process** giúp xem lại sau khi process đã mất; không phải source hay nhật ký mọi bước trước crash. Nó có thể chứa dữ liệu nhạy cảm, cần lưu và giới hạn quyền theo phạm vi đang phân tích.

## 3. Lab 1: trace một lỗi mở file có thể tái tạo

**Terminal — cửa sổ giao tiếp văn bản** hiển thị lệnh/kết quả; **shell — trình đọc và thực hiện lệnh**, ở đây là Bash. Cần GCC, GDB, strace và Python 3 cho phần tương ứng. `command -v TEN_LENH` tìm công cụ trong **PATH — danh sách thư mục tìm lệnh**, không xác nhận kernel cho phép công cụ theo dõi.

Trong Bash thường không bật `set -e`, tạo thư mục tạm riêng để không ghi đè bài làm cũ. `mktemp -d` tạo thư mục mới và in đường dẫn; chỉ tiếp tục khi thành công. Kiểm tra thành công trước bước sau:

```bash
debug_lab=$(mktemp -d)
cd -- "$debug_lab" || exit 1
printf 'trace fixture\n' > sample.txt
strace -o missing.log -e trace=openat,open,read,write,close cat -- no-such-file
trace_status=$?
printf 'cat/trace status=%s\n' "$trace_status"
cat missing.log
```

Thư mục tạm mới giúp bảo đảm không có file `no-such-file` do bài làm trước để lại. `strace -o` giữ trace riêng, không trộn vào stdout dữ liệu chương trình; `-e trace=...` giới hạn loại syscall. `$?` lấy kết quả lệnh vừa kết thúc, cần lưu trước lệnh khác. Khi tracer chạy được, trạng thái phản ánh kết quả chương trình theo quy tắc công cụ; nếu tracer tự lỗi quyền/khởi chạy thì phải đọc lỗi trước, không kết luận đã đo cat.

Ví dụ **minh họa**, lược bỏ thao tác đọc thư viện khởi động:

```text
openat(AT_FDCWD, "no-such-file", O_RDONLY) = -1 ENOENT (No such file or directory)
... write(2, ... thong bao loi ...) ...
+++ exited with 1 +++
```

**`ENOENT`** là mã không tìm thấy file/thành phần đường dẫn; **FD — file descriptor** là số nhận diện tài nguyên mở trong process, `2` thường là stderr — đầu ra báo lỗi. Không có FD thành công cho file này để đọc. `AT_FDCWD` cho biết đường dẫn tương đối theo thư mục hiện tại. Những `read` khác trong trace có thể thuộc bộ nạp thư viện, không chứng minh cat đọc được file thiếu.

Đổi `no-such-file` thành `sample.txt`, lưu trace khác và tìm lần mở file thành công rồi các FD/số byte tương ứng. Muốn theo con do ứng dụng tạo, dùng `strace -f`; **attach — gắn vào process đang chạy** với `-p PID` có thể bị permission — quyền xem/tác động tài nguyên — và chính sách ptrace hạn chế. **Ptrace** là cơ chế kiểm soát/quan sát process mà nhiều debugger/tracer dùng. Lab ưu tiên khởi chạy đối tượng của mình, không thay `ptrace_scope` host để vượt giới hạn.

## 4. Lab 2: dừng tại SIGABRT rồi đọc đường gọi và biến

### 4.1. Tạo một lỗi ứng dụng có chủ đích

Lưu `crash.c` trong thư mục lab:

```c
#include <stdlib.h>

static void process_request(int request_id) {
    if (request_id == 42) abort();
}

int main(void) {
    process_request(42);
    return 0;
}
```

`abort()` yêu cầu kết thúc bất thường bằng **SIGABRT — tín hiệu hủy thực thi ứng dụng** theo cơ chế thư viện/hệ thống. Đây là process C do bạn tạo; không phải segfault, không phải kernel panic, không sửa file dữ liệu thật. **SIGSEGV — tín hiệu truy cập bộ nhớ sai** là nguyên nhân khác, không dùng thay tên SIGABRT khi báo cáo lab.

```bash
gcc -Wall -Wextra -g -O0 crash.c -o crash-lab
( ulimit -c 0; gdb -q ./crash-lab )
```

Chỉ tiếp tục khi biên dịch thành công. `-Wall -Wextra` bật nhóm cảnh báo. **`ulimit -c`** điều khiển giới hạn kích thước core cho process trong phạm vi shell; dấu `(...)` chạy trong shell con, nên không đổi giới hạn shell ngoài. Đặt 0 tránh core file thông thường do cơ chế hệ điều hành của lần thử này, nhưng nếu core_pattern dùng chương trình nhận core thì quy tắc giới hạn có ngoại lệ; không dựa vào nó như một cam kết kiểm soát mọi cơ chế dump. Lab dừng tại signal trong GDB rồi kết thúc inferior, không yêu cầu tiếp tục cho OS tự dump. Nguồn: [core(5)](https://man7.org/linux/man-pages/man5/core.5.html).

GDB là debugger; `-q` bỏ banner dài. **Inferior — chương trình bị GDB điều khiển** là `crash-lab`, khác process GDB. Trong dấu nhắc `(gdb)`, gõ:

```gdb
run
bt
```

`run` khởi chạy inferior. Kỳ vọng GDB dừng vì `Program received signal SIGABRT` trước khi chương trình kết thúc theo tín hiệu. **Backtrace — chuỗi lời gọi hiện tại** hiển thị bằng `bt`; **stack — ngăn xếp lời gọi** giữ trạng thái các hàm đang hoạt động; **frame — khung gọi hàm** biểu diễn một lần gọi còn trong chuỗi đó. Frame `#0` là vị trí hiện tại, frame sau là nơi gọi nó. Xem [GDB backtrace](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Backtrace.html).

### 4.2. Chọn frame thuộc code của bạn, không đoán chỉ số

Backtrace **minh họa đã lược**, chỉ số/libc/dòng source trên máy thật có thể khác:

```text
#0 ... ham trong thu vien phat signal ...
#1 ...
#N process_request (request_id=42) at crash.c:4
#M main () at crash.c:8
```

`N`, `M` là giá trị giữ chỗ, **không gõ `frame N` nguyên chữ**. Lấy số thật đứng trước `process_request`, ví dụ nếu `#4` thì:

```gdb
frame 4
info args
info locals
print request_id
list
```

`frame 4` chọn khung, `info args` xem đối số, `info locals` xem biến cục bộ, `print` đọc giá trị, `list` xem source quanh vị trí chọn. **Đối số** là dữ liệu truyền vào hàm; `request_id` là đối số nên `info locals` có thể nói không có biến cục bộ — đó không phải lỗi debugger. Kỳ vọng `print request_id` là 42, khớp nhánh gọi abort. Xem [GDB variables](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Variables.html).

Nếu chưa có symbol cho libc, một số frame có thể hiện địa chỉ/tên ít thông tin; vẫn cần tìm frame source lab có `-g`. Nếu không tìm thấy, kiểm tra mở đúng binary, source và build; không chọn ngẫu nhiên frame số 4 của máy khác.

Thoát bằng `quit`, xác nhận kết thúc inferior nếu GDB hỏi. Không gõ `continue` sau SIGABRT nếu mục tiêu chỉ là đọc trạng thái lab này. Với chương trình nhiều thread, `thread apply all bt` xem mọi thread; một `bt` mặc định chỉ xem thread đang chọn.

### 4.3. Tùy chọn: lưu ảnh process bằng GDB, không sửa core_pattern

Khi đang dừng ở SIGABRT, có thể tạo file **chỉ của fixture**:

```gdb
generate-core-file ./crash-lab.core
quit
```

Kiểm tra file được tạo thành công, xác nhận kết thúc inferior rồi mở lại:

```bash
gdb -q ./crash-lab ./crash-lab.core
```

Trong GDB đọc `bt`, chọn frame thật của `process_request` và `print request_id`. Core do debugger tạo là ảnh lúc dừng được chọn, không là lịch sử chạy. Kernel/debugger và mapping có thể ảnh hưởng phần dữ liệu được lưu; gặp cảnh báo cần đọc, không mặc định file có mọi byte. Xem [GDB core generation](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Core-File-Generation.html).

Cơ chế dump tự động ngoài GDB còn phụ thuộc `/proc/sys/kernel/core_pattern`, quyền, cấu hình và nơi nhận. Chỉ đọc `ulimit -c`, `cat /proc/sys/kernel/core_pattern`; trên hệ dùng systemd-coredump có thể dùng `coredumpctl list/info` khi được phép. Có công cụ không chứng minh đã lưu core, còn chưa thấy file `core` trong thư mục không chứng minh chưa dump. Không sửa core_pattern toàn hệ để ép đường dẫn lab. Chỉ giữ/chia sẻ core fixture phù hợp; xóa nó sau học nếu không cần.

## 5. Lab 3: đo CPU có thời gian giới hạn bằng perf

**Counter — bộ đếm sự kiện** cộng số lần/thời gian sự kiện được hỗ trợ. **Hardware counter — bộ đếm phần cứng** như cycles phụ thuộc CPU/VM; **software event — sự kiện phần mềm** như task-clock/cpu-clock cho một góc đo khác. **Call graph — cây/chuỗi lời gọi** giúp nối sample đến nơi gọi. `perf stat` thống kê, `perf record` ghi mẫu vào file, `perf report` đọc file; ba lệnh không thay nhau.

Lab tùy chọn nếu có perf đúng môi trường và quyền. Không hạ `perf_event_paranoid` trên host. Quyền truy cập có thể phụ thuộc policy, capability và container/VM; phần cứng không được ảo hóa đủ cũng có thể không có counter. Xem [perf security của kernel](https://docs.kernel.org/admin-guide/perf-security.html).

```bash
perf stat -e task-clock -- timeout 3s python3 -c 'while True: pass'
perf_status=$?
printf 'perf/child status=%s\n' "$perf_status"
```

**Workload — công việc đưa vào phép đo** ở đây là vòng lặp Python cố ý dùng CPU, giới hạn khoảng 3 giây bằng `timeout`. **Elapsed time — thời gian trôi qua** khác thời gian CPU thực dùng; task có thể không được CPU chạy liên tục. `timeout` thường trả 124 khi hết hạn, nên trạng thái khác 0 ở lần thành công này không tự là perf hỏng; đọc cả dữ liệu và stderr. Nếu perf không đo được do quyền/tool mismatch, ghi hạn chế đó và dừng phần đo, không tuyên bố đã có sample. Xem [perf-stat(1)](https://man7.org/linux/man-pages/man1/perf-stat.1.html).

Chỉ khi điều kiện đo phù hợp, ghi mẫu trong thư mục lab:

```bash
perf record -e cpu-clock -g -o perf-lab.data -- timeout 3s python3 -c 'while True: pass'
perf report --stdio -i perf-lab.data
```

`-g` yêu cầu ghi thông tin call graph theo khả năng/cách unwinding của môi trường; **unwinding — dựng lại chuỗi lời gọi** dựa vào thông tin trạng thái/symbol. Chỉ report file thực sự được ghi có sample; file rỗng hay report lỗi không là kết quả “CPU 0”. Xem [perf-record(1)](https://man7.org/linux/man-pages/man1/perf-record.1.html).

Trong report, đọc số sample, sự kiện, cột tỷ lệ và symbol chiếm nhiều mẫu. Profile Python có thể chủ yếu thấy mã interpreter — bộ thông dịch thực thi Python — hoặc thiếu stack ngôn ngữ; muốn thấy hàm Python đầy đủ cần cơ chế/công cụ tương thích bản Python/perf. Không diễn giải một tên thư viện thành dòng Python mà công cụ chưa ánh xạ được.

**Flame graph — biểu đồ xếp chuỗi gọi theo số mẫu** nếu tạo từ profile có ô rộng khi nhận nhiều sample theo cách đo, không tự chứng minh hàm chậm trong mỗi lần gọi. Khi xem tỷ lệ, biết đang đọc self — mẫu tại chính hàm — hay children — phần bao gồm hàm được gọi — tránh cộng trùng. Sampling có sai số và tác động đo; dùng cùng workload/cách đo khi so sánh.

## 6. ftrace và eBPF bổ sung điều gì, và vì sao không bật tùy tiện?

**ftrace** là hệ quan sát/tracing kernel, hỗ trợ **tracepoint — điểm sự kiện đã định nghĩa** và theo dõi hàm khi kernel được cấu hình hỗ trợ. **tracefs — cây file giao diện tracing** thường ở `/sys/kernel/tracing`; bố cục/cách truy cập có thể khác. Đọc điểm có sẵn và cấu hình là việc khác với ghi để bật tracing. Không cần ghi `tracing_on`, chọn tracer hay thay trace buffer host trong lab này. Xem [ftrace của kernel](https://docs.kernel.org/trace/ftrace.html).

**eBPF** cho phép nạp chương trình theo cơ chế/ràng buộc của kernel vào hook — điểm gắn xử lý/sự kiện — để quan sát hoặc xử lý theo loại chương trình. **Verifier — bộ kiểm tra trước khi nạp** kiểm chứng các điều kiện an toàn theo mô hình kernel; có verifier không có nghĩa mọi chương trình đo đều không tác động hệ thống hay mọi user được phép nạp. Phiên bản kernel, helper — hàm hỗ trợ được phép — quyền và kiểu hook quyết định dùng được gì. Xem [eBPF verifier](https://docs.kernel.org/bpf/verifier.html).

**Overhead — chi phí thêm do đo** có thể làm CPU/thời gian thay đổi. Tracer có thể đổi thứ tự chạy giữa thread, làm race — lỗi phụ thuộc truy cập/thứ tự đồng thời — khó tái tạo hoặc biến mất. Vì vậy bắt đầu từ câu hỏi hẹp, giới hạn đối tượng/thời gian/dữ liệu, ghi baseline — kết quả khi chưa bật công cụ — trước khi so. Không coi “hết lỗi khi attach” là đã sửa chương trình.

## 7. Crash ứng dụng khác oops/panic của kernel thế nào?

**Oops** là báo cáo lỗi trong kernel; hệ có thể tiếp tục tùy lỗi/cấu hình nhưng trạng thái có thể đã bị ảnh hưởng. **Panic** là đường xử lý lỗi nghiêm trọng làm kernel ngừng vận hành bình thường; hệ có thể dừng hoặc reboot theo cấu hình. Không suy “máy chưa reboot” là kernel vẫn hoàn toàn an toàn. Nguồn: [hướng dẫn săn lỗi kernel](https://docs.kernel.org/admin-guide/bug-hunting.html).

**Kdump** dùng một **crash kernel — kernel thứ hai chuẩn bị để thu dữ liệu sau crash** qua cơ chế kexec. **Vmcore — ảnh bộ nhớ/trạng thái kernel bị lỗi** khác core của process. Muốn dùng cần vùng RAM dự trữ, kernel hỗ trợ, nơi lưu đủ dung lượng và quy trình đã thử trên máy lab riêng. Cài package chưa chứng minh crash kernel đã nạp hoặc đường lưu hoạt động. Bài chỉ đọc cơ chế, không gây panic, không thay boot parameter hoặc cấu hình kdump host. Xem [kdump](https://docs.kernel.org/admin-guide/kdump/kdump.html).

**Module kernel — thành phần mã có thể nạp vào kernel** và **taint — dấu trạng thái kernel đã gặp một số điều kiện đặc biệt** giúp mô tả bối cảnh. Taint không tự xác định thủ phạm; có thể lưu dấu từ sự kiện trước dù module không còn. Xem [tainted kernels](https://docs.kernel.org/admin-guide/tainted-kernels.html).

Một báo cáo hữu ích cần: kernel/build/config thật, module/taint, log đầy đủ với thời điểm, binary/symbol khớp, thao tác tái tạo và môi trường. **Log — bản ghi sự kiện** có thể cho thấy lỗi trước hậu quả; dòng cuối không luôn là nguyên nhân đầu tiên. Với kernel cần vmlinux — file kernel có symbol phù hợp — và công cụ tương thích; không dùng core ứng dụng thay vmcore hoặc trộn symbol build khác.

## 8. Lỗi thường gặp và tự kiểm tra

| Dấu hiệu/suy luận | Cách đọc đúng hơn |
|---|---|
| `info locals` không có request_id | Nó là đối số; chọn frame đúng, dùng `info args`/`print` |
| Có `<optimized out>` | Tối ưu/debug info không giữ đủ vị trí; không tự là lỗi giá trị |
| `strace` không có read trong lúc dùng dữ liệu | Có thể truy cập mapping/cache/user space; syscall không là mọi thao tác |
| CPU profile nhỏ mà request mất nhiều giây | Xét off-CPU, hàng đợi/chờ và phạm vi đo |
| Không có counter/sample trong VM | Kiểm tra quyền/hỗ trợ/tool, không suy không có CPU work |
| Chạy dưới debugger thì hết lỗi | Thời gian/thứ tự đã thay đổi; cần kiểm tra race và baseline |
| Core mở được với binary cùng tên | Vẫn cần đúng build, thư viện và symbol |

1. Trace có `ENOENT` rồi chương trình exit 1. Cần đo hardware cycles trước để biết tên file sai không? **Đối chiếu:** không; chọn công cụ theo câu hỏi, đã có bằng chứng syscall/đường dẫn.
2. GDB dừng trong libc khi SIGABRT, source lab ở frame khác. Chọn gì? **Đối chiếu:** tìm frame `process_request` thật, xem đối số/dòng gọi; không giả định frame 4 mọi máy.
3. Perf có nhiều sample trong một hàm. Có chắc mỗi lần gọi đều chậm? **Đối chiếu:** không; số lần gọi/thời gian/tỷ lệ phạm vi và cách sampling cùng ảnh hưởng.
4. Chưa thấy file core cục bộ. Có chắc hệ chưa lưu dump? **Đối chiếu:** xem pattern/receiver/manager và quyền; không đổi global chỉ để ép ví dụ.
5. Cài kdump rồi có đủ bằng chứng quy trình phục hồi crash hoạt động? **Đối chiếu:** chưa; cần crash kernel dự trữ/nạp và đường lưu kiểm chứng ở máy lab riêng.
6. CPU không cao nhưng chương trình treo. Cần điều tra gì? **Đối chiếu:** thread trạng thái/chỗ chờ, mọi backtrace và sự tiến triển theo thời gian, không chỉ profile CPU.

Giữ trace có mã lỗi, backtrace có frame và request_id 42, cùng kết quả perf hoặc ghi hạn chế cụ thể. Phân biệt đầu ra bạn đã chạy với hình minh họa. Core/vmcore có thể chứa bí mật; chỉ giữ dữ liệu trong phạm vi lab và không gửi dump thật tùy tiện.

**Mô hình ghi nhớ:** câu hỏi quyết định điểm quan sát; tracing cho sự kiện, profiling cho phân bố theo phép đo, debugger/core cho trạng thái. Symbol đúng build giúp diễn giải; công cụ thay đổi timing và có giới hạn. Bài 35 nối các dấu hiệu treo/race với đồng bộ và khóa để giải thích vì sao có thread nhưng không có tiến triển.

## Nguồn và đối chiếu phiên bản

Nguồn GDB, Linux man-pages và tài liệu kernel được gắn cạnh nội dung. Tra `man gdb`, `man perf`, `man coredumpctl`, `gdb --version`, `perf --version`, `uname -r` trên máy. Chính sách theo dõi, counter, cấu hình tracing và cách symbol/unwind phụ thuộc kernel/toolchain/VM; một lệnh tồn tại chưa chứng minh phép đo được cho phép.
