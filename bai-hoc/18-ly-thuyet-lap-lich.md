# Bài 18 — Thuật toán lập lịch CPU

[Mục lục](../README.md) · [← Bài 17](17-quan-ly-bo-nho.md) · [Bài 19 →](19-scheduler-linux.md)

## Mục tiêu

Cần bài 12. Tính được waiting/response/turnaround và giải thích trade-off trước khi học scheduler Linux thực tế. Các mô hình dưới giả định một CPU, bỏ qua chi phí context switch và I/O nếu không nói khác.

## 1. Các đại lượng

Với arrival A, burst CPU B, first start S và completion C:

- Turnaround = C − A: tổng thời gian từ đến đến xong.
- Response = S − A: thời gian đến lần chạy đầu.
- Waiting = turnaround − B trong mô hình chỉ có CPU, không có I/O.

Preemptive scheduling có thể lấy CPU khỏi task đang chạy; non-preemptive chờ task block hoặc hoàn tất. Mục tiêu công bằng, response thấp và throughput cao có thể mâu thuẫn.

## 2. Các thuật toán

| Thuật toán | Quy tắc | Hạn chế chính |
|---|---|---|
| FCFS | Đến trước chạy trước | Convoy effect: task ngắn đợi task dài |
| SJF | Chọn burst ngắn nhất trong task đã đến | Cần dự đoán burst; có thể starvation |
| SRTF | Chọn remaining time ngắn nhất, có preemption | Cần thông tin/dự đoán, nhiều switch |
| Round Robin | Mỗi task nhận tối đa quantum mỗi vòng | Quantum quá nhỏ tăng overhead |
| Priority | Chọn ưu tiên cao | Task thấp có thể starvation |
| MLFQ | Nhiều hàng đợi, điều chỉnh theo hành vi | Quy tắc boost/demotion ảnh hưởng kết quả |

Aging nâng dần ưu tiên task chờ lâu để giảm starvation. Trong MLFQ, task tương tác thường được ưu tiên đáp ứng nhưng phải tránh việc task khai thác quy tắc để chiếm lợi thế. Đây là lý thuyết, không gọi mọi policy Linux là một trong các thuật toán này nguyên dạng.

## 3. Ví dụ đã giải

Ba task cùng đến tại t=0, thứ tự ban đầu P1, P2, P3; burst lần lượt 8, 4, 2.

FCFS:

```text
0        8    12  14
|   P1   | P2 | P3 |
```

Waiting = (0, 8, 12), trung bình 20/3. Turnaround = (8, 12, 14), trung bình 34/3. Response bằng waiting vì không preempt.

SJF chạy P3 → P2 → P1. Waiting theo thứ tự P1,P2,P3 = (6,2,0), trung bình 8/3; turnaround = (14,6,2), trung bình 22/3. P1 chịu chờ dài hơn để tổng trung bình giảm.

Round Robin quantum 2:

```text
0 P1 2 P2 4 P3 6 P1 8 P2 10 P1 12 P1 14
```

Completion theo P1,P2,P3 = (14,10,6); response = (0,2,4); waiting = (6,6,4). Hai lát cuối P1 liền nhau vì không còn đối thủ; hết quantum không bắt buộc phải đổi sang task khác nếu không có ai.

## 4. Lab: tự mô phỏng preemption

Dùng P1=(arrival 0, burst 7), P2=(2,4), P3=(4,1). Với SRTF, khi P2 đến, P1 còn 5 nên bị preempt; khi P3 đến, P2 còn 2 nên bị preempt.

Đáp án để đối chiếu sau khi tự vẽ:

```text
0–2 P1 | 2–4 P2 | 4–5 P3 | 5–7 P2 | 7–12 P1
```

Completion = (12,7,5), turnaround = (12,5,1), waiting = (5,1,0), response = (0,0,0). Viết mô phỏng bằng Python tùy chọn; ghi rõ tie-break nếu hai task bằng nhau.

## 5. Mẹo và kiểm tra đạt

- Không dùng công thức waiting = turnaround − burst nếu bài toán còn thời gian blocked mà không trừ phần đó.
- Quantum lớn làm RR gần FCFS; quantum quá nhỏ không miễn phí trên máy thực.
- SJF tối ưu trung bình trong một số giả định không có nghĩa biết trước tương lai trong hệ thật.
- Nộp ba Gantt chart, phép tính và một ví dụ task ưu tiên thấp bị starvation. Đề xuất aging và giải thích trade-off.

## Đọc thêm

Đối chiếu thuật ngữ với `man 7 sched`; bài 19 chuyển từ mô hình sang cơ chế Linux.
