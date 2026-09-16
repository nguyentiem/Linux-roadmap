# Bài 31 — Phương pháp tìm bottleneck

[Mục lục](../README.md) · [← Bài 30](30-backup-recovery.md) · [Bài 32 →](32-cpu-memory-performance.md)

## Mục tiêu

Cần bài 17, 19, 23–25, 29. Xây giả thuyết có thể bác bỏ và phân biệt symptom với nguyên nhân. Cài sysstat trong VM nếu cần `iostat`, `pidstat`, `sar`.

## 1. Bắt đầu từ yêu cầu và workload

“Máy chậm” chưa đủ thông tin. Cần biết endpoint/job, khoảng thời gian, số request, kích thước dữ liệu, percentile latency, error rate và điều gì vừa thay đổi. Baseline phải cùng workload và phạm vi tài nguyên; so production giờ cao điểm với lab rảnh không cô lập được nguyên nhân.

Utilization mô tả mức dùng tài nguyên; saturation mô tả công việc phải chờ; errors mô tả lỗi. CPU 100% nhưng không có hàng đợi dài có thể là sử dụng hiệu quả; CPU thấp nhưng app chờ mutex vẫn chậm. Chọn metric theo tài nguyên và ngữ nghĩa của tool.

## 2. Queueing và tail latency

Khi tải đến tiến gần khả năng phục vụ, hàng đợi có thể tăng nhanh. Little's Law L = λW liên hệ số công việc trung bình trong hệ, throughput trung bình và thời gian trung bình khi hệ ổn định và các đại lượng có cùng ranh giới đo.

Ví dụ throughput 100 request/s, thời gian trong hệ trung bình 0.2 s thì trung bình khoảng 20 request đang ở trong hệ. Đây không phải công thức thay p99 hay dự báo mọi đợt burst. Retry không kiểm soát có thể làm tải tăng đúng lúc hệ suy yếu.

## 3. Bộ quan sát đầu tiên

```bash
uptime
vmstat 1 5
iostat -xz 1 5
pidstat -u -r -d 1 5
ss -s
cat /proc/pressure/cpu
cat /proc/pressure/memory
cat /proc/pressure/io
```

Một số công cụ in sample đầu là trung bình từ boot, các sample sau là khoảng đo; đọc manual. Load average gồm task runnable và một số task chờ không ngắt được, không phải CPU percent. I/O `%util` không tự cho biết thiết bị song song đã hết throughput tối đa.

## 4. Lab: bảng giả thuyết

Đo 20 request tới proxy bài 25 bằng curl, lưu timestamp, status và duration như bài 29. Chạy tải CPU giới hạn thời gian từ bài 19 rồi đo lại. HTTP file nhỏ có thể không chậm đáng kể; đó là kết quả hợp lệ, không sửa số liệu để khớp giả thuyết.

| Giả thuyết | Bằng chứng dự kiến | Điều làm giảm độ tin cậy |
|---|---|---|
| Thiếu CPU | Run queue/CPU pressure tăng, CPU task bận | App chủ yếu ngủ, không pressure |
| Chờ storage | Latency I/O và wait tăng cùng workload | Không có I/O đáng kể |
| Chờ upstream | Proxy log timeout, backend chậm | Backend trả nhanh từ cùng đường mạng |
| Chờ khóa | Thread block cùng lock, off-CPU time cao | Thread đang tính toán liên tục |

Chỉ đổi một biến mỗi lần: số worker, quota, kích thước dataset hoặc concurrency. Giữ log thô và version cấu hình. Dừng thử nếu ảnh hưởng vượt ngân sách lab.

## 5. Mẹo và kiểm tra đạt

- Tăng timeout có thể giảm lỗi hiển thị nhưng tăng số request treo và bộ nhớ; đó không tự là tối ưu.
- Trung bình che tail; p99 cần đủ mẫu và cách tổng hợp đúng.
- Client tạo tải cũng có thể là bottleneck. Đo CPU/network ở cả hai đầu.
- Nộp báo cáo gồm symptom, baseline, hai giả thuyết, phép đo, kết luận và điều chưa biết. Nếu chưa đủ bằng chứng, kết luận “chưa xác định” kèm phép đo tiếp theo.

## Đọc thêm

`man vmstat`, `man iostat`, `man pidstat`, `man uptime`; [sysstat](https://sysstat.github.io/).
