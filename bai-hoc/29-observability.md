# Bài 29 — Quan sát và vận hành dịch vụ

[Mục lục](../README.md) · [← Bài 28](28-ansible.md) · [Bài 30 →](30-backup-recovery.md)

## Mục tiêu

Cần bài 15, 25, 28. Xác định hệ thống phục vụ tốt hay không từ góc nhìn người dùng, liên hệ symptom với log và metric.

## 1. Log, metric và trace

Log lưu sự kiện có ngữ cảnh; metric tổng hợp số liệu theo thời gian; trace liên kết các bước của một request xuyên thành phần. Không công cụ nào thay hoàn toàn hai công cụ còn lại. Log cần timestamp và định danh request khi phù hợp; metric cần đơn vị, kiểu counter/gauge/histogram và label có cardinality kiểm soát.

Counter tăng tích lũy và có thể reset khi restart. Gauge mô tả giá trị hiện tại. Histogram hỗ trợ phân bố latency nhưng độ phân giải phụ thuộc bucket. Không lấy trung bình các p99 từng máy để suy ra p99 toàn hệ thống.

## 2. Health và SLO

Liveness hỏi process có cần khởi động lại không; readiness hỏi instance có nên nhận traffic không. Nếu liveness phụ thuộc tất cả dịch vụ ngoài, một database chập chờn có thể khiến toàn bộ ứng dụng restart đồng loạt.

SLI là cách đo hành vi như tỷ lệ request hợp lệ thành công trong ngưỡng latency. SLO là mục tiêu trên một cửa sổ. Ví dụ mục tiêu 99.9% thành công cho 1,000,000 request cho phép 1,000 request không đạt theo định nghĩa đó. Error budget phải cùng mẫu số và loại trừ có chủ đích, không tùy ý bỏ request lỗi.

## 3. Lab: đo từ bên ngoài service

```bash
mkdir -p "$HOME/linux-lab/observability"
cd "$HOME/linux-lab/observability"
for i in $(seq 1 20); do
    date -u +%FT%TZ
    curl --silent --show-error --max-time 2 --output /dev/null \
      --write-out '%{http_code} %{time_total}\n' http://127.0.0.1:8081/
done > probe.log 2> probe-errors.log
journalctl -u linux-lab-http --since '-10 minutes' --no-pager
systemctl show linux-lab-http -p MainPID -p NRestarts
```

Đây là probe tuần tự nhỏ, không phải load benchmark. Dừng backend trong VM, chạy lại rồi phục hồi bằng `systemctl start`. So sánh systemd active của proxy với HTTP success; proxy có thể vẫn active khi trả lỗi upstream.

Để thu metric host bằng hệ Prometheus, cài node exporter theo tài liệu chính thức và chỉ mở trên mạng giám sát phù hợp. Chọn CPU, memory available, filesystem free/inode, network errors và service request/error/duration; không thu mọi metric rồi mới quyết định mục tiêu.

## 4. Cảnh báo có hành động

Một alert tốt nêu symptom, phạm vi, thời gian, dashboard/log liên quan và bước kiểm tra đầu tiên. Dùng khoảng thời gian duy trì để tránh nhiễu thoáng qua; tránh ngưỡng CPU 80% cho mọi workload. CPU cao có thể hợp lý ở batch, trong khi latency cao với CPU thấp vẫn là sự cố.

Thiết kế alert gần hết disk dựa trên dung lượng, tốc độ tăng và thời gian can thiệp. Kiểm tra đường thông báo bằng diễn tập có chủ đích; rule tồn tại không chứng minh người trực nhận được.

## 5. Thời gian và shutdown

Wall clock dùng timestamp liên hệ sự kiện; monotonic clock dùng đo duration để tránh nhảy thời gian. Đồng bộ NTP và ghi timezone rõ. Graceful shutdown cần ngừng nhận request mới, hoàn thành phần đang chạy trong timeout, rồi giải phóng tài nguyên.

## 6. Kiểm tra đạt

Nộp định nghĩa một SLI có mẫu số rõ, một alert kèm runbook và timeline backend dừng/phục hồi. Giải thích vì sao chỉ giám sát process count không đủ và vì sao label user_id có thể tạo cardinality rất lớn.

## Đọc thêm

`man journalctl`, `man 2 clock_gettime`; [Prometheus instrumentation practices](https://prometheus.io/docs/practices/instrumentation/).
