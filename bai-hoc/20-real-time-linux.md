# Bài 20 — Real-time scheduling và PREEMPT_RT

[Mục lục](../README.md) · [← Bài 19](19-scheduler-linux.md) · [Bài 21 →](21-storage-filesystem.md)

## Mục tiêu

Cần bài 04, 18–19. Phân tích thời gian đáp ứng toàn tuyến, hiểu FIFO/RR/DEADLINE và thiết kế phép đo latency. Chỉ chạy lab trong VM hoặc máy thử nghiệm có console.

## 1. Policy real-time

`SCHED_FIFO` chọn task ưu tiên real-time cao nhất có thể chạy; task tiếp tục đến khi block, bị task cao hơn preempt hoặc yield theo quy tắc policy. `SCHED_RR` bổ sung chia quantum giữa các task cùng ưu tiên. Thang ưu tiên real-time khác nice; task RT có thể lấn át workload thường nên không chạy vòng lặp vô hạn với ưu tiên cao trong lab.

`SCHED_DEADLINE` khai báo runtime Q, deadline D và period T, thường cần Q ≤ D ≤ T. Nó dùng EDF kết hợp CBS để quản lý ngân sách; admission control có thể từ chối tập yêu cầu không phù hợp. Deadline trong scheduler không tự chứng minh toàn bộ I/O và ứng dụng đáp ứng đúng hạn. [Tài liệu SCHED_DEADLINE](https://docs.kernel.org/scheduler/sched-deadline.html)

## 2. Rate Monotonic, EDF và giới hạn mô hình

Rate Monotonic đặt task có period ngắn hơn ở ưu tiên cao hơn. Với các task định kỳ độc lập, deadline bằng period, một CPU preemptive và bỏ qua overhead, điều kiện đủ cổ điển là tổng Cᵢ/Tᵢ ≤ n(2^(1/n) − 1). Vượt ngưỡng không tự kết luận không lập lịch được; cần phân tích sâu hơn.

Với EDF trong mô hình một CPU, task độc lập và deadline bằng period, utilization ≤ 1 là điều kiện nền tảng. Khi có blocking, jitter, nhiều CPU hoặc overhead, không bê nguyên kết luận này vào production.

Ví dụ hai task C/T là 1/4 và 1/5 có utilization 0.45. Ngân sách CPU lý tưởng còn dư nhưng một mutex bị giữ 10 ms vẫn có thể làm deadline 4 ms thất bại.

## 3. Priority inversion và PREEMPT_RT

Task H ưu tiên cao đợi khóa do L ưu tiên thấp giữ. Task M ưu tiên trung bình giành CPU của L, làm H chờ gián tiếp M. Priority inheritance có thể tạm nâng ưu tiên L để giải phóng khóa sớm; không loại bỏ mọi deadlock hoặc critical section quá dài.

PREEMPT_RT thay đổi nhiều đường khóa và xử lý interrupt để giảm vùng không preempt được. Một số `spinlock_t` có ngữ nghĩa khác kernel thường, còn `raw_spinlock_t` giữ vai trò khóa cấp thấp. Không áp dụng máy móc quy tắc context giữa hai cấu hình. [Khác biệt PREEMPT_RT](https://docs.kernel.org/core-api/real-time/differences.html)

## 4. Lab: đo wake-up jitter không cần RT privilege

Lưu và chạy Python sau khi máy tương đối rảnh, rồi chạy lại cùng tải CPU có giới hạn 15 giây từ bài 19:

```python
import time

period = 0.01
deadline = time.monotonic() + period
late = []
for _ in range(500):
    time.sleep(max(0.0, deadline - time.monotonic()))
    late.append(max(0.0, time.monotonic() - deadline) * 1000)
    deadline += period
late.sort()
print("lateness ms: p50", late[249], "p99", late[494], "max", late[-1])
```

Đây là demo wake-up lateness bằng Python, không phải phép chứng nhận RT hay thay thế công cụ đo chuyên dụng. Dùng mốc tuyệt đối tránh tích lũy drift do mỗi lần sleep tương đối sau phần xử lý. `time.monotonic()` tránh ảnh hưởng thay đổi wall clock.

## 5. Nhánh đo nâng cao và kiểm tra đạt

Nếu cần so sánh RT kernel, cài `rt-tests` theo distro, đọc `cyclictest --help` và manual đúng phiên bản. Lập ma trận cùng phần cứng, tải, thời lượng, CPU affinity và chính sách; lưu histogram cùng kernel config. Không tắt RT throttling để “làm đẹp” số đo.

Nộp ngân sách deadline, histogram hai trạng thái tải và giới hạn của kết luận. Trả lời: p99 thấp có loại trừ một spike rất lớn không? **Không; tail còn lại vẫn tồn tại.**

## Đọc thêm

`man 7 sched`, `man 2 sched_setattr`, `man chrt`, `man cyclictest`; [PREEMPT_RT theory](https://docs.kernel.org/core-api/real-time/theory.html).
