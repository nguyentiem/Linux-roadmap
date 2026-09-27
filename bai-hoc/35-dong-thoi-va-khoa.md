# Bài 35 — Đồng thời, khóa và xử lý bất đồng bộ

[Mục lục](../README.md) · [← Bài 34](34-debug-tracing-crash.md) · [Bài 36 →](36-container-cgroups.md)

## Mục tiêu: giữ dữ liệu đúng khi thứ tự chạy thay đổi

Hai luồng cùng tăng số bản ghi đã xử lý, cuối cùng số đếm bị thiếu. Thêm khóa làm số đúng nhưng một thiết kế khác lại chờ mãi. Vấn đề không chỉ là “nhiều luồng”: cần biết dữ liệu nào được chia sẻ, điều kiện đúng nào phải giữ và quan hệ nào cho phép đọc kết quả của nhau.

Nên đã học bài 12, 16, 20, 34 và biết C/pthreads cơ bản. Bài nhắc lại khái niệm trước khi dùng, chỉ chạy chương trình nhỏ của bạn, giới hạn thời gian và không thử khóa/kernel context bằng mã gây treo host.

Sau bài, bạn cần phân biệt race với data race/undefined behavior, chọn mutex hoặc atomic theo invariant, đọc report của công cụ mà không coi chạy thử đúng là chứng minh, vẽ deadlock và biết vì sao quy tắc user space khác một số ngữ cảnh kernel.

## 1. Đồng thời có bắt buộc nhiều lõi CPU không?

**Process — tiến trình** là một lần chương trình đang chạy; **thread — luồng thực thi** là một dòng công việc trong process. Các thread cùng process thường dùng chung bộ nhớ, nhưng có trạng thái thực thi riêng. **CPU** thực hiện chỉ dẫn; **lõi CPU** là đơn vị xử lý bên trong CPU. **Kernel — nhân hệ điều hành** quản lý tài nguyên và chọn task — đơn vị thực thi thường tương ứng thread Linux — được dùng CPU.

**Concurrency — đồng thời về tiến triển** nghĩa nhiều công việc có thể xen kẽ trong cùng khoảng thời gian. **Parallelism — thực hiện song song** nghĩa nhiều công việc thực sự chạy cùng lúc trên nhiều đơn vị xử lý. Một CPU vẫn có concurrency: thread A bị tạm ngừng giữa đọc và ghi, thread B chạy chen vào. Do đó “máy chỉ có một lõi” không tự loại bỏ race.

**Pthreads — giao diện luồng POSIX** cung cấp các hàm như `pthread_create` tạo luồng và `pthread_join` chờ một luồng kết thúc. **POSIX** là tập chuẩn giao diện hệ điều hành phổ biến; API — tập hàm/quy tắc ứng dụng gọi — có quy ước trả lỗi riêng. Nhiều hàm pthread trả trực tiếp mã lỗi khác 0, không đặt `errno` như nhiều syscall. Xem [pthreads(7)](https://man7.org/linux/man-pages/man7/pthreads.7.html).

Tình huống xuyên suốt là hai worker — luồng thực hiện việc — mỗi bên ghi nhận 100000 lần hoàn tất công việc. Sau khi cả hai đã được join, mong đợi tổng 200000. Đây là bộ đếm đơn giản, chưa phải cơ chế công bố một bản ghi dữ liệu hoàn chỉnh.

## 2. `counter++` có gì mà không an toàn cho hai luồng?

Ở mức ý nghĩa, `counter++` cần đọc giá trị, cộng một rồi ghi kết quả. **Race condition — điều kiện tranh chấp** là lỗi kết quả phụ thuộc thứ tự/timing của các thao tác mà thiết kế không kiểm soát phù hợp. Một lịch xen kẽ **minh họa mô hình**, chưa phải cam kết thực thi C:

```text
Ban đầu counter = 10
Thread A: đọc 10
Thread B: đọc 10
Thread A: tính 11, ghi 11
Thread B: tính 11, ghi 11
Kết quả mô hình: 11 thay vì 12
```

Đọc theo từng dòng thời gian. Hai thread đều làm việc nhưng một lần cập nhật bị che. Không dùng sơ đồ để khẳng định compiler luôn tạo đúng ba lệnh hay C chương trình lỗi luôn chỉ mất một lần tăng.

**Data race — tranh chấp dữ liệu theo mô hình bộ nhớ C** xảy ra khi các truy cập xung đột ở thread khác nhau, ít nhất một bên ghi, đối tượng/thao tác không thỏa điều kiện atomic và không có quan hệ đồng bộ cần thiết. **Undefined behavior — hành vi không được chuẩn bảo đảm** nghĩa chuẩn C không cam kết kết quả hợp lệ nào; không chỉ là “đôi khi thiếu vài đơn vị”. Bản lỗi có thể in đúng 200000 ở một lần chạy mà vẫn sai thiết kế. Nguồn chính: [bản dự thảo chuẩn C11 N1570, mục 5.1.2.4](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf).

**`volatile`** yêu cầu một số quy tắc về truy cập đối tượng theo ngôn ngữ, thường dùng cho tương tác đặc biệt; nó không biến tăng biến thành atomic và không tạo đồng bộ thread. Thêm volatile hoặc sleep để “cho thread khác kịp chạy” không sửa data race.

## 3. Mutex bảo vệ cái gì: một biến hay một điều kiện đúng?

**Mutex — khóa loại trừ lẫn nhau** cho một thread giữ quyền đi vào phần việc được bảo vệ tại một thời điểm. **Critical section — vùng thao tác cần bảo vệ** là đoạn code truy cập/cập nhật dữ liệu chung theo giao thức khóa. **Invariant — điều kiện đúng phải luôn được giữ ở các điểm quan sát phù hợp** là mục tiêu thật của khóa.

Với bộ đếm, invariant là “mỗi lần hoàn tất tăng đúng một, không mất cập nhật”. Với hàng đợi, có thể là “số phần tử khớp dữ liệu và chỉ số đầu/cuối hợp lệ”. Một mutex bảo vệ cả nhóm dữ liệu liên quan; nếu chỉ khóa lúc ghi số lượng nhưng đọc dữ liệu/đổi chỉ số ở ngoài, invariant vẫn có thể hỏng.

```text
Thread A                         Thread B
lock mutex thành công            lock mutex: chưa được vào
  đọc/sửa dữ liệu                   chờ theo cơ chế thư viện/kernel
  giữ invariant
unlock mutex                     lock thành công sau đó
                                   đọc/sửa dữ liệu đã được đồng bộ
                                 unlock mutex
```

Mũi tên thời gian ngầm từ trên xuống. Mutex không bảo vệ tự động mọi dòng code trong process: **mọi đường truy cập liên quan** phải tuân thủ cùng giao thức. Khóa/nhả phù hợp còn tạo quan hệ đồng bộ để thread sau quan sát thay đổi trước theo mô hình được quy định, không chỉ chặn thực thi cùng thời điểm. Xem [pthread_mutex_lock](https://man7.org/linux/man-pages/man3/pthread_mutex_lock.3p.html).

Không giữ khóa trong lúc làm I/O — nhập/xuất như chờ mạng hoặc ghi file — kéo dài nếu có thể tách an toàn: thread khác sẽ chờ lâu. Nhưng cũng không nhả giữa một cập nhật nhiều bước rồi để lộ trạng thái dở dang. Cần xác định ranh giới invariant trước khi tối ưu độ dài vùng khóa.

## 4. Atomic, semaphore, condition variable và futex giải quyết việc khác nhau ra sao?

**Atomic — thao tác nguyên tử theo mô hình ngôn ngữ** có quy tắc rõ để các thread không thấy một thao tác bị chia vụn như truy cập thường. C11 cung cấp kiểu/hàm trong `<stdatomic.h>`. **Memory ordering — thứ tự quan sát bộ nhớ** quy định quan hệ giữa thao tác atomic và dữ liệu khác. **Happens-before — quan hệ trước/sau do mô hình đồng bộ xác lập** không chỉ là đồng hồ cho thấy A chạy trước B.

Trong lab chỉ cần cộng bộ đếm bằng `atomic_fetch_add_explicit(..., memory_order_relaxed)`. **Relaxed — thứ tự nới lỏng** vẫn bảo đảm tính nguyên tử cho cập nhật atomic đó, nhưng không dùng nó làm bằng chứng “dữ liệu khác đã được công bố xong”. Ví dụ đặt cờ ready rồi đọc một buffer ở thread khác cần giao thức phù hợp, thường có quan hệ release/acquire — công bố/tiếp nhận — hoặc mutex; không chỉ thay mỗi biến cờ thành atomic rồi mặc định mọi thứ an toàn. Atomic cũng không tự giữ invariant gồm nhiều biến/thao tác. Tra mục 7.17 trong [C11 N1570](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf).

**Semaphore — bộ đếm quyền lấy tài nguyên** cho phép một số lượng công việc vào theo số suất; ví dụ giới hạn tối đa ba việc dùng một nhóm tài nguyên. `sem_wait` lấy/đợi suất, `sem_post` trả/tăng suất. Nó không có đúng mô hình ownership — chủ giữ — như mutex; chọn theo việc đếm suất hoặc khóa dữ liệu. Xem [sem_wait(3)](https://man7.org/linux/man-pages/man3/sem_wait.3.html).

**Condition variable — biến điều kiện để chờ thay đổi trạng thái** phối hợp với mutex và **predicate — điều kiện logic trên dữ liệu**, ví dụ hàng đợi chưa rỗng. Thread phải kiểm tra predicate trong vòng `while`; một lần được đánh thức không bảo đảm dữ liệu đã thỏa mãn. `pthread_cond_wait` nhả mutex để chờ và lấy lại khi quay về; kiểm tra predicate ngoài giao thức đó có thể làm bỏ lỡ thay đổi. Xem [pthread_cond_wait](https://man7.org/linux/man-pages/man3/pthread_cond_wait.3p.html).

**Futex — cơ chế đợi/đánh thức trên một giá trị trong bộ nhớ user space** là hỗ trợ của kernel mà nhiều primitive — thành phần đồng bộ — thư viện có thể dùng ở đường chờ. Mutex không nhất thiết syscall mỗi lần: lúc không tranh khóa có thể xử lý trong user space. Thấy `futex` trong strace gợi ý cơ chế đồng bộ/chờ, không tự xác định mutex ứng dụng nào là thủ phạm. Xem [futex(2)](https://man7.org/linux/man-pages/man2/futex.2.html).

**Spinlock — khóa chờ chủ động** kiểm tra lặp lại khi chưa lấy được khóa, tiêu thụ CPU thay vì ngủ theo cách chờ thông thường. Nó có ích trong một số vùng rất ngắn/ngữ cảnh kernel nhưng không thay mutex cho mọi code ứng dụng. Trên hệ một CPU hoặc thread giữ khóa bị ngừng chạy, quay vòng có thể làm tốn thời gian; ngữ nghĩa kernel còn phụ thuộc PREEMPT_RT ở mục 8.

## 5. Lab: mặc định an toàn, so mutex với atomic

### 5.1. Điều kiện và mã chương trình

Cần Linux, GCC có C11 và pthreads; chạy trong terminal — cửa sổ giao tiếp văn bản — dùng Bash, shell đọc/thực hiện lệnh. Lab khoảng 200000 cập nhật, không giữ chạy vô hạn. `mktemp -d` tạo thư mục tạm riêng tránh ghi đè `counter.c`/binary cũ; chỉ tiếp tục khi tạo thành công. Dùng Bash thường không bật `set -e`, vì lệnh sanitizer/timeout có thể trả lỗi có chủ đích:

```bash
concurrency_lab=$(mktemp -d)
cd -- "$concurrency_lab" || exit 1
```

Lưu mã thành `counter.c`. Chế độ mặc định là mutex an toàn; `atomic` cũng an toàn cho hợp đồng đếm. Chế độ `race` cố ý sai **chỉ để công cụ phát hiện**, không dùng làm phép đo/kỳ vọng số đếm:

```c
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define LOOPS 100000L
static long counter;
static atomic_long atomic_counter;
static int mode; /* 0: locked, 1: atomic, 2: intentional race */
static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;

static void check(int error, const char *operation) {
    if (error != 0) {
        fprintf(stderr, "%s failed: code=%d\n", operation, error);
        exit(EXIT_FAILURE);
    }
}

static void *worker(void *unused) {
    (void)unused;
    for (long i = 0; i < LOOPS; ++i) {
        if (mode == 1) {
            atomic_fetch_add_explicit(&atomic_counter, 1, memory_order_relaxed);
        } else if (mode == 2) {
            counter++; /* intentional data race: not valid concurrent C */
        } else {
            check(pthread_mutex_lock(&mutex), "lock");
            counter++;
            check(pthread_mutex_unlock(&mutex), "unlock");
        }
    }
    return NULL;
}

int main(int argc, char **argv) {
    if (argc > 2) return 2;
    if (argc == 2) {
        if (strcmp(argv[1], "atomic") == 0) mode = 1;
        else if (strcmp(argv[1], "race") == 0) mode = 2;
        else if (strcmp(argv[1], "locked") != 0) return 2;
    }
    atomic_init(&atomic_counter, 0);
    pthread_t a, b;
    check(pthread_create(&a, NULL, worker, NULL), "create a");
    check(pthread_create(&b, NULL, worker, NULL), "create b");
    check(pthread_join(a, NULL), "join a");
    check(pthread_join(b, NULL), "join b");
    long result = mode == 1
        ? atomic_load_explicit(&atomic_counter, memory_order_relaxed)
        : counter;
    printf("counter=%ld expected=%ld\n", result, 2 * LOOPS);
    check(pthread_mutex_destroy(&mutex), "destroy");
    return 0;
}
```

`mode` được đặt **trước** khi tạo thread và không sửa tiếp, nên các worker không tranh ghi biến này. Biến static bắt đầu bằng 0; `atomic_init` khởi tạo atomic counter trước khi tạo thread, không cạnh tranh với truy cập nào. `check` kiểm tra mã trả trực tiếp của pthread, không đọc `errno`. Nếu API thất bại, lab kết thúc cả process và không báo kết quả thành công; chương trình production — hệ vận hành thật — thường cần chính sách thu hồi/recovery chi tiết hơn.

`pthread_join` bảo đảm mỗi worker đã hoàn tất trước khi main đọc tổng. Không đọc `counter` giữa lúc worker còn tăng mà không giữ khóa; một reader bỏ giao thức khóa cũng có thể gây data race. Với atomic, relaxed đủ cho **bộ đếm riêng** và việc chờ join ở đây; không suy sang một hàng đợi/buffer khác.

### 5.2. Biên dịch và chạy hai chế độ đúng

```bash
gcc -std=c11 -Wall -Wextra -g -O0 -pthread counter.c -o counter
timeout 5s ./counter locked
timeout 5s ./counter atomic
```

`-pthread` chọn hỗ trợ biên dịch/liên kết luồng, `-g` giữ debug info, `-O0` giảm tối ưu cho lab. Chỉ chạy khi biên dịch thành công. `timeout 5s` giới hạn thử nghiệm; nếu trả 124, chưa hoàn thành, không phải bằng chứng số đếm đúng. Mỗi lần bình thường cần in:

```text
counter=200000 expected=200000
```

Đây là **kết quả kỳ vọng từ hợp đồng**, không là số xuất hiện bắt buộc nếu thiếu tài nguyên/API lỗi. Xác nhận mã 0 ngay sau mỗi lệnh bằng `printf 'status=%s\n' "$?"` nếu cần. Bản an toàn vừa giữ invariant vừa chờ đủ worker. Nó chưa chứng minh một kiểu khóa nhanh hơn kiểu khác; không dùng thời gian một lần chạy O0 với workload nhỏ làm benchmark — phép đo hiệu năng đáng tin.

Không chạy `./counter race` để “xem có ra 200000 không” rồi đánh giá đúng/sai. Data race đã vi phạm mô hình C dù một lần trùng số mong đợi; compiler có quyền biến đổi theo tiền đề code hợp lệ.

### 5.3. Tùy chọn: ThreadSanitizer kiểm tra đường sai

**ThreadSanitizer — công cụ chèn theo dõi truy cập/đồng bộ để tìm data race**, viết TSan, cần compiler/runtime — phần hỗ trợ lúc chạy — phù hợp. Nó có overhead và cần không gian địa chỉ/bộ nhớ đáng kể so với binary thường; trên board ít RAM bỏ bước này, không tăng giới hạn host để ép chạy. Xem [GCC instrumentation options](https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html), [TSan của Clang](https://clang.llvm.org/docs/ThreadSanitizer.html).

Trong máy/VM đủ tài nguyên:

```bash
gcc -std=c11 -g -O1 -fsanitize=thread -pthread counter.c -o counter-tsan
timeout 5s ./counter-tsan race
```

Chạy chế độ sai **chỉ trong bản được instrument — gắn mã theo dõi — này** để đọc chẩn đoán. Kỳ vọng nếu runtime hoạt động và phát hiện đường truy cập là report `WARNING: ThreadSanitizer: data race`, chứa lần ghi/đọc ở `worker`, địa chỉ đối tượng và stack của thread liên quan. Report/exit status phụ thuộc runtime/cấu hình, không dùng số counter của đường UB làm sản phẩm đạt.

Nếu có `FATAL: ThreadSanitizer: unexpected memory mapping`, lỗi khởi tạo/runtime, hết hạn hoặc thiếu hỗ trợ, ghi lại compiler/kernel/môi trường và dừng. **Đây không phải race report của chương trình**, và không có report không chứng minh không race. Có thể chạy bản `locked` dưới sanitizer trong môi trường phù hợp để kiểm tra đường đã sửa, nhưng nó vẫn chỉ kiểm tra các đường/thứ tự đã thực sự chạy; không chứng minh toàn bộ ứng dụng khác.

## 6. Deadlock, livelock và starvation khác nhau ra sao?

**Deadlock — bế tắc** là các bên chờ điều kiện/tài nguyên mà chính vòng chờ ngăn hoàn tất. Ví dụ hai mutex A/B:

```text
Thread 1 giữ A, đợi B đang do Thread 2 giữ
Thread 2 giữ B, đợi A đang do Thread 1 giữ

Wait-for graph — đồ thị ai chờ ai:
Thread 1 --đợi tài nguyên của--> Thread 2
Thread 2 --đợi tài nguyên của--> Thread 1
```

Mũi tên tạo vòng, nên không thread nào tự tiến tới nhả khóa theo thiết kế đó. Không cần cố chạy fixture treo để thấy quan hệ. Một cách sửa là **thứ tự khóa toàn cục**: mọi path — đường đi trong code — lấy A trước B, nhả sau khi dữ liệu đạt invariant. Chỉ sửa một nhánh mà nhánh khác còn B→A chưa đủ.

**Livelock — hoạt động nhưng không tiến triển** là hai bên liên tục nhả/thử/nhường nhau mà không hoàn tất; khác deadlock ngủ chờ, nó có thể dùng CPU. **Starvation — thiếu cơ hội tiến triển kéo dài** là một task không lấy được CPU/khóa/tài nguyên đủ để hoàn tất, dù bên khác vẫn chạy. Lock/atomic không tự bảo đảm fairness — phân phối cơ hội công bằng — ở mọi thiết kế.

**Timeout — giới hạn chờ** giúp phát hiện/giới hạn một lần đợi, nhưng cần rollback — đưa trạng thái dở dang về điều kiện hợp lệ — hoặc xử lý lỗi. Không được báo “thành công” sau khi chỉ bỏ qua một khóa chưa lấy được. `trylock` thất bại cũng không cho phép đi vào critical section như đã sở hữu khóa.

Với process treo thuộc quyền của bạn, GDB `thread apply all bt` cho các thread đang ở đâu; kết hợp log — bản ghi sự kiện — và quan sát lại để phân biệt chờ bình thường với vòng chờ. Một thread ở `futex` không tự chứng minh deadlock, có thể đang chờ công việc đúng thiết kế. Quyền attach/tác động timing vẫn có giới hạn như bài 34.

## 7. Bất đồng bộ có nghĩa được khóa hoặc làm mọi việc trong handler không?

**Asynchronous — bất đồng bộ** nghĩa sự kiện hoàn tất/thông báo không cần theo đúng chuỗi chờ trực tiếp của nơi khởi tạo; chương trình phải quản lý trạng thái/vòng đời dữ liệu đến lúc được dùng. **Callback — hàm gọi lại** xử lý một sự kiện; nó chạy ở đâu, có thể ngủ hay lấy khóa không phụ thuộc cơ chế, không chỉ tên callback.

**Signal handler — hàm xử lý tín hiệu** có thể chen vào code đang giữ mutex. Gọi lại thao tác không an toàn hoặc lấy cùng khóa trong handler có thể treo/sai; mutex thông thường không là công cụ an toàn cho mọi signal handler C. Chỉ dùng API theo quy tắc async-signal-safe — an toàn trong ngữ cảnh tín hiệu bất đồng bộ — hoặc thiết kế chuyển yêu cầu về luồng làm việc phù hợp. Xem [signal-safety(7)](https://man7.org/linux/man-pages/man7/signal-safety.7.html).

Với condition variable/hàng đợi, handler/nguồn sự kiện chỉ báo việc có thể đến; worker kiểm tra predicate và xử lý dưới giao thức dữ liệu. Không dùng một cờ thường giữa thread rồi gọi đó là “bất đồng bộ” để tránh quy tắc memory model.

## 8. Trong kernel, vì sao có nơi không được ngủ?

**Context — ngữ cảnh thực thi** cho biết code đang chạy trong loại hoạt động nào và những gì được phép. **Hard interrupt — ngắt phần cứng trực tiếp** cần xử lý theo quy tắc không được ngủ tùy ý; **ngủ** ở đây là nhường CPU để chờ có thể kéo dài, không phải gọi sleep trong mọi ngữ cảnh. Mutex có thể chờ/ngủ nên không đưa nguyên mẫu user-space mutex vào mọi interrupt handler.

**Workqueue — cơ chế đưa công việc sang worker kernel** giúp xử lý phần việc trong ngữ cảnh thích hợp có thể thực hiện những thao tác cần chờ khi được phép. **Softirq — cơ chế xử lý công việc hoãn trong kernel** có quy tắc riêng, không coi như thread ứng dụng thông thường dù một số công việc có thể được thực hiện bởi kernel thread. Xem [kernel workqueue](https://docs.kernel.org/core-api/workqueue.html).

**RCU — Read-Copy-Update** hỗ trợ đọc đồng thời theo giao thức, thường cho phép reader tránh khóa kiểu mutex ở những cấu trúc phù hợp. **Grace period — khoảng đảm bảo các reader cũ đã đi qua điểm cần thiết** cho phép trì hoãn thu hồi đối tượng đến lúc không còn reader trước đó dùng nó. Không `free` đối tượng ngay sau bỏ tham chiếu khỏi cấu trúc rồi mặc định mọi reader đã xong; RCU không tự thay mọi invariant cập nhật hay mọi mutex. Xem [RCU của kernel](https://docs.kernel.org/RCU/whatisRCU.html).

**PREEMPT_RT — cấu hình/biến thể kernel cho khả năng đáp ứng thời gian thực** đổi ngữ nghĩa một số khóa/ngữ cảnh. `spinlock_t` có thể dùng cơ chế khác với kernel thường; `raw_spinlock_t` giữ những ràng buộc thấp hơn theo quy tắc. Không khẳng định mọi spinlock luôn tắt preemption — khả năng bị task khác thay trên CPU — hoặc mọi interrupt đều thực thi giống kernel không RT. Xem [lock types](https://docs.kernel.org/locking/locktypes.html) và [khác biệt realtime](https://docs.kernel.org/core-api/real-time/differences.html).

Phần kernel là ranh giới cần biết trước học driver: không viết/nạp module thử ngủ trong ngắt, không gây treo hệ thống để làm bài. Phải xác định kernel/config và API/context thật trước áp dụng quy tắc khóa.

## 9. Lỗi thường gặp và tự kiểm tra

| Suy luận dễ sai | Cách kiểm tra/sửa |
|---|---|
| Race version in đúng nhiều lần nên không lỗi | Xem giao thức đồng bộ và chuẩn C, không suy từ số ngẫu nhiên |
| `volatile` đủ cho chia sẻ thread | Cần mutex/atomic và ordering đúng mục tiêu |
| Mỗi lần ghi có mutex là đủ | Mọi reader/writer và cả invariant nhiều biến phải cùng giao thức |
| Atomic counter bảo vệ luôn buffer | Đếm nguyên tử khác công bố dữ liệu, cần giao thức phù hợp |
| Thread ở futex nên chắc deadlock | Đọc mọi backtrace, predicate/tài nguyên và tiến triển |
| Timeout hết thì cứ dùng dữ liệu dở | Cần xử lý lỗi/rollback, chưa sở hữu khóa thì không được vào |
| Spinlock nhanh hơn mutex ở mọi nơi | Phụ thuộc context, thời gian giữ, tranh chấp và lập lịch |

1. Máy một lõi có thể mất cập nhật do nhiều thread không đồng bộ không? **Đối chiếu:** có thể xen kẽ; trong C data race còn là UB, không chỉ mô hình mất số.
2. `counter` được khóa khi ghi nhưng main đọc khi worker chưa join, không giữ mutex. Có đúng không? **Đối chiếu:** reader cũng phải đồng bộ; chờ join hoặc lấy khóa theo thiết kế.
3. Khi nào relaxed atomic đủ trong lab? **Đối chiếu:** chỉ đếm một atomic, main chờ cả hai thread; không dùng làm cờ công bố dữ liệu khác.
4. Hàng đợi dùng condition variable được đánh thức. Có được đọc ngay mà không kiểm tra predicate? **Đối chiếu:** không; kiểm tra trong while với mutex do spurious wakeup/điều kiện đã đổi.
5. Mọi nơi lấy A trước B có giúp loại vòng A/B? **Đối chiếu:** giúp với mô hình này, cần áp dụng mọi path; không chứng minh không có deadlock từ tài nguyên khác.
6. TSan báo fatal mapping thay vì data race. Đó có là report đạt không? **Đối chiếu:** không; ghi hạn chế runtime, vẫn giải thích data race bằng mô hình code.
7. Có thể gọi hàm chờ/ngủ trong mọi callback kernel không? **Đối chiếu:** không; phải biết context và quy tắc kernel/config, đặc biệt RT.

Giữ output/status của locked và atomic, sơ đồ vòng chờ và thứ tự khóa đã đề xuất. Nếu TSan chạy được, chú thích report đường sai; nếu không, ghi lỗi thật, không thay bằng output minh họa. Không cần cố tạo deadlock hoặc test kernel interrupt trên host.

**Mô hình ghi nhớ:** xác định dữ liệu chung → viết invariant → chọn giao thức đồng bộ/ordering → mọi đường truy cập tuân thủ → kiểm tra tiến triển và giới hạn. Mutex, atomic và các primitive giải quyết trách nhiệm khác nhau; số luồng không bảo đảm đúng hoặc nhanh. Bài 36 chuyển từ chia sẻ trong process sang cách ly tầm nhìn và điều khiển tài nguyên giữa nhóm process.

## Nguồn và đối chiếu môi trường

Nguồn C11, POSIX/Linux man-pages, GCC/Clang và kernel được gắn tại phần liên quan. Tra `man pthreads`, `man pthread_mutex_lock`, `man pthread_cond_wait`, `man 2 futex`, compiler version và tài liệu kernel đang chạy. Cấu hình sanitizer, libc, kiến trúc và PREEMPT_RT có thể làm cách quan sát khác; không biến kết quả một lần test thành chứng minh tổng quát.
