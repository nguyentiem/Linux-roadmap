# Bài 35 — Đồng thời, khóa và xử lý bất đồng bộ

[Mục lục](../README.md) · [← Bài 34](34-debug-tracing-crash.md) · [Bài 36 →](36-container-cgroups.md)

## Mục tiêu

Cần bài 12, 16, 20, 34 và C/pthreads cơ bản. Nhận diện race/deadlock, sửa invariant và phân biệt đồng bộ user space với context kernel.

## 1. Race, atomicity và ordering

Biểu thức `counter++` gồm đọc, tính và ghi ở mức ý nghĩa; nhiều thread không đồng bộ có thể mất cập nhật. Trong C, data race trên đối tượng không atomic gây undefined behavior, không chỉ sai vài đơn vị. `volatile` không tạo atomicity hay quan hệ đồng bộ giữa thread.

Mutex bảo vệ critical section/invariant. Atomic cung cấp thao tác và memory ordering xác định, nhưng không tự giữ invariant nhiều biến. Semaphore đếm tài nguyên; spinlock chờ chủ động và phù hợp một số context rất ngắn. Futex là cơ chế kernel hỗ trợ chờ/đánh thức trên địa chỉ user memory, thường đứng dưới primitive thư viện.

## 2. Lab pthreads

Lưu `counter.c`. Chế độ mặc định cố ý có data race để minh họa lỗi; chế độ `locked` dùng mutex:

```c
#include <pthread.h>
#include <stdio.h>
#include <string.h>

static long counter;
static int locked;
static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;

static void *worker(void *unused) {
    (void)unused;
    for (int i = 0; i < 100000; ++i) {
        if (locked) pthread_mutex_lock(&mutex);
        counter++;
        if (locked) pthread_mutex_unlock(&mutex);
    }
    return NULL;
}

int main(int argc, char **argv) {
    pthread_t a, b;
    locked = argc > 1 && strcmp(argv[1], "locked") == 0;
    if (pthread_create(&a, NULL, worker, NULL) != 0) return 1;
    if (pthread_create(&b, NULL, worker, NULL) != 0) {
        pthread_join(a, NULL);
        return 1;
    }
    pthread_join(a, NULL);
    pthread_join(b, NULL);
    printf("counter=%ld expected=200000\n", counter);
    pthread_mutex_destroy(&mutex);
    return 0;
}
```

```bash
gcc -Wall -Wextra -g -O0 -pthread counter.c -o counter
./counter
./counter locked
gcc -g -O1 -fsanitize=thread -pthread counter.c -o counter-tsan
./counter-tsan
```

ThreadSanitizer cần toolchain/runtime và môi trường hỗ trợ; có thể không hoạt động trong một số VM/container. Race version đôi khi vẫn in 200000: đó không chứng minh đúng. Locked version phải giữ invariant sau khi cả hai thread join. Bản lab tối giản không xử lý mọi lỗi API như chương trình production.

## 3. Deadlock và livelock

Hai thread khóa A→B và B→A có thể chờ nhau mãi. Thiết lập thứ tự khóa toàn cục hoặc thay thiết kế để giảm khóa lồng nhau. Timeout giúp giới hạn chờ nhưng cần xử lý trạng thái dở dang. Livelock là các thread vẫn hoạt động nhưng liên tục phản ứng qua lại mà không tiến triển; starvation là một task không nhận đủ cơ hội.

Bài tập: vẽ wait-for graph hai mutex rồi đề xuất thứ tự A trước B cho mọi path. Với chương trình treo, dùng GDB `thread apply all bt` để xem các thread đang chờ đâu thay vì chỉ restart.

## 4. Context kernel

Hard interrupt context không được ngủ tùy ý; workqueue đưa phần việc vào context worker phù hợp. Softirq là cơ chế deferred work với quy tắc riêng, không coi như user thread thông thường. RCU cho phép đọc đồng thời theo giao thức và trì hoãn thu hồi đến sau grace period; nó không thay mọi loại mutex.

PREEMPT_RT thay đổi ngữ nghĩa một số khóa/context. Phải đối chiếu cấu hình trước khi khẳng định spinlock luôn tắt preemption hoặc mọi interrupt đều chạy như kernel thường.

## 5. Kiểm tra đạt và đọc thêm

Nộp race report hoặc giới hạn runtime, output locked và sơ đồ deadlock. Giải thích vì sao “chạy thử đúng nhiều lần” chưa chứng minh không race.

`man pthreads`, `man pthread_mutex_lock`, `man 2 futex`; [kernel locking](https://docs.kernel.org/locking/index.html), [RCU](https://docs.kernel.org/RCU/index.html).
