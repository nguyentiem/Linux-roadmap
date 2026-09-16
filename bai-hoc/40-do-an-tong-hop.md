# Bài 40 — Đồ án tổng hợp và bảo vệ quyết định kỹ thuật

[Mục lục](../README.md) · [← Bài 39](39-senior-troubleshooting.md)

## Mục tiêu và đầu vào

Hoàn thành các lab cốt lõi bài 01–39, đặc biệt service, networking, backup, automation và profiling. Đồ án là bài tập xây và kiểm chứng hệ thống của người học; các kết quả phải do bạn đo, không điền trước số liệu giả định thành kết quả thật.

## 1. Bài toán

Xây dịch vụ quản lý ghi chú hoặc đơn hàng đơn giản có endpoint health, đọc dữ liệu và tạo bản ghi. Dùng ba VM: proxy, app, database; control machine quản trị có thể là host lab. Giới hạn tài nguyên theo máy thực có sẵn và ghi rõ nếu phải giảm số VM.

```text
Client lab → Proxy → Application → Database
                  ↘ log/metric ↙
                    Monitoring
Database/config → Backup độc lập → Restore VM mới
Control machine → cấu hình bằng automation
```

Service Python static bài 15 hữu ích để kiểm tra đường mạng, nhưng không thay ứng dụng có dữ liệu của đồ án. Có thể dùng ứng dụng mẫu do bạn viết bằng ngôn ngữ quen thuộc; không cần framework phức tạp, cần request và giao dịch dữ liệu đủ để đo đúng.

## 2. Yêu cầu chức năng và vận hành

| Hạng mục | Điều kiện nghiệm thu |
|---|---|
| API | Tạo/đọc bản ghi, xử lý đầu vào sai bằng mã lỗi hợp lý |
| Process | User riêng, systemd hoặc runtime quản lý, graceful shutdown |
| Mạng | Proxy là điểm vào; database chỉ nhận từ phạm vi cần thiết |
| Bảo mật | Secret ngoài Git, quyền hẹp, cập nhật có kế hoạch |
| Automation | Dựng lại máy sạch, lần chạy thứ hai không drift vô nghĩa |
| Quan sát | Request/error/duration, CPU/RAM/disk, log có timestamp |
| Backup | Khôi phục dữ liệu sang máy/database mới và kiểm tra nghiệp vụ |
| Hiệu năng | Dataset, concurrency, duration và môi trường đo được ghi rõ |
| Thay đổi | Có version, tiêu chí abort và rollback đã diễn tập |

Đặt SLO/RPO/RTO riêng và ghi là **mục tiêu đồ án**, không là cam kết sản phẩm. Ví dụ mục tiêu thử nghiệm: không mất dữ liệu đã backup, restore trong 30 phút; chọn latency phù hợp workload sau khi đo baseline.

## 3. Các mốc thực hiện

1. **Thiết kế:** sơ đồ IP/port, dependency, failure domain, ngân sách tài nguyên và cách quản lý secret.
2. **Dựng baseline:** cài VM, cấu hình bằng automation, chạy service có lưu dữ liệu và kiểm tra reboot.
3. **Quan sát:** probe bên ngoài, metric ứng dụng/host, log tập trung hoặc quy trình truy xuất rõ.
4. **Backup/restore:** backup nhất quán, copy độc lập, dựng đích mới, xác nhận dữ liệu và quyền.
5. **Benchmark:** baseline rảnh, tăng tải có giới hạn, xác định bottleneck và thử một thay đổi.
6. **Failure drill:** mỗi lần một lỗi, thu evidence, phục hồi, viết postmortem.
7. **Bảo vệ:** giải thích lựa chọn và giới hạn, chứng minh tái tạo từ tài liệu.

## 4. Ma trận sự cố bắt buộc

| Tình huống | Cách tạo trong lab | Bằng chứng cần thu |
|---|---|---|
| Service không start | Sai working directory bằng drop-in | Unit, journal, fix và HTTP check |
| Backend mất | Stop app có chủ đích | Proxy error, probe, thời gian phục hồi |
| CPU throttle | Quota thấp trên app thử nghiệm | cpu.stat, throughput và latency |
| Lỗi truy cập dữ liệu | Thu hẹp quyền file fixture | Identity, ACL/MAC nếu liên quan, log |
| Dung lượng khó giải thích | File unlinked còn mở bài 39 | FD/lsof, df/du, giải phóng có kiểm soát |
| DNS/địa chỉ sai | Đổi upstream trên bản cấu hình lab | Resolver/route/socket, config rollback |
| Mất máy dữ liệu | Dùng VM restore mới từ backup | Kiểm tra bản ghi, RPO/RTO thực đo |

Không làm đầy filesystem root để học đầy đĩa; dùng volume lab có giới hạn. Không gây kernel panic trên host; phần crash kernel chỉ làm trên VM chuyên dụng khi đã chuẩn bị kdump và console.

## 5. Hồ sơ bàn giao

```text
project/
  README.md                 # cách dựng, chạy và kiểm tra
  architecture.md           # sơ đồ, IP/port, failure domain
  automation/               # playbook, template, inventory mẫu
  app/                      # source hoặc tham chiếu version rõ
  runbooks/                 # deploy, rollback, restore, incident
  evidence/                 # log và số liệu đã bỏ secret
  reports/                  # benchmark, restore drill, postmortem
```

Report benchmark phải ghi cả thay đổi không hiệu quả. Không xóa dữ liệu bất lợi để tạo kết luận đẹp. Evidence cần gắn timestamp và version, đủ để người khác kiểm tra lại.

## 6. Rubric đánh giá

| Nhóm | Điểm | Tiêu chí |
|---|---:|---|
| Hiểu cơ chế | 20 | Giải thích boot, scheduler, memory, network/storage path |
| Tái tạo và automation | 20 | Dựng máy sạch, idempotency, config version |
| Vận hành/bảo mật | 20 | Quyền tối thiểu, health, log, cập nhật |
| Điều tra và hiệu năng | 20 | Giả thuyết, bằng chứng, phép đo, giới hạn |
| Restore và bàn giao | 20 | Restore thật, RPO/RTO, runbook dùng được |

Gợi ý đạt: từ 80/100 và bắt buộc restore thành công, không để secret trong artifact, có evidence phục hồi các lỗi đã tạo. Điểm này chỉ đánh giá đồ án, không tự chứng nhận chức danh senior.

## 7. Câu hỏi bảo vệ

1. Nếu proxy và app cùng host chết, redundancy hiện tại giúp được gì?
2. Vì sao app latency cao dù CPU host thấp? Bạn kiểm tra cgroup, lock và upstream theo thứ tự nào?
3. Dữ liệu được coi là durable tại điểm nào và backup có nhất quán với ứng dụng không?
4. Tăng vCPU, thêm replica hoặc đổi scheduler: bằng chứng nào khiến bạn chọn từng phương án?
5. Khi rollback binary không tương thích schema mới, kế hoạch của bạn là gì?

Sau đồ án, chọn nhánh chuyên sâu: SRE/platform, storage/network, embedded Linux hoặc kernel development. Dùng điểm yếu trong evidence thực tế để quyết định phần học tiếp.

## Đọc thêm

Quay lại tài liệu nguồn ở các bài liên quan; [Google SRE workbook](https://sre.google/workbook/table-of-contents/) cung cấp ví dụ vận hành để so sánh với thiết kế của bạn.
