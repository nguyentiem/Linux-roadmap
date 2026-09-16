# Bài 39 — Thiết kế và xử lý sự cố ở mức senior

[Mục lục](../README.md) · [← Bài 38](38-build-kernel.md) · [Bài 40 →](40-do-an-tong-hop.md)

## Mục tiêu

Cần bài 29–38. Tìm nguyên nhân từ bằng chứng, giảm ảnh hưởng có kiểm soát và chuyển bài học sự cố thành cải tiến có người chịu trách nhiệm.

## 1. Mô hình hệ thống và failure domain

Vẽ dependency theo đường request và đường dữ liệu. Hai instance cùng host không độc lập trước lỗi host; hai VM dùng cùng storage không độc lập trước lỗi storage. HA giảm một số điểm hỏng, nhưng replication không thay backup khi dữ liệu sai bị nhân bản.

Capacity planning cần workload peak, tốc độ tăng, thời gian mở rộng và tình huống mất một phần tài nguyên. Headroom nên đủ cho failure scenario đã chọn, không chỉ ngày bình thường. Tăng replica có thể đẩy bottleneck xuống database hoặc connection pool.

## 2. Quy trình incident

1. Xác nhận ảnh hưởng: ai bị lỗi, chức năng nào, bắt đầu khi nào.
2. Kiểm tra thay đổi gần thời điểm đó nhưng chưa kết luận chúng là nguyên nhân.
3. Giảm ảnh hưởng bằng hành động có rollback: giảm tải, chuyển traffic, quay cấu hình tương thích.
4. Giữ log, metric, version và timeline cần thiết trước khi restart làm mất bằng chứng.
5. Kiểm chứng phục hồi bằng SLI người dùng, không chỉ process active.
6. Phân tích nguyên nhân, yếu tố góp phần và biện pháp phòng ngừa.

Trong bài lab tự thực hiện vai trò điều tra và ghi chép; không cần gửi thông báo ra hệ thống thật.

## 3. Lab: file đã xóa vẫn chiếm dung lượng

Trong VM, chỉ tạo file 32 MiB trong thư mục lab. Lưu và chạy Python ở terminal một:

```python
from pathlib import Path
import os

path = Path.home() / "linux-lab" / "deleted-open.bin"
with path.open("wb") as f:
    for _ in range(32):
        f.write(b"x" * (1024 * 1024))
    f.flush()
    os.fsync(f.fileno())
    print("PID", os.getpid(), "path", path, flush=True)
    path.unlink()
    input("File unlinked, FD still open. Enter to close...")
```

Terminal hai: dùng `lsof +L1` nếu có hoặc xem `/proc/PID/fd` với PID thực. File không còn trong `du` cây thư mục nhưng vẫn được FD tham chiếu. Sau Enter, FD đóng và block có thể được giải phóng. Với filesystem có snapshot/COW/accounting khác, đo delta có thể không chính xác 32 MiB; đối chiếu cơ chế thay vì ép số.

Không dùng kill hàng loạt để “giải phóng disk”; xác định process sở hữu và cơ chế reopen log/restart phù hợp.

## 4. Tình huống tổng hợp

Proxy trả 502, load cao và disk gần đầy cùng lúc. Lập ít nhất ba giả thuyết: backend không chạy vì không ghi được file; backend còn chạy nhưng bị quota/timeout; proxy cấu hình upstream sai. Kiểm tra `curl` trực tiếp backend, service log, cgroup, `df -h`, `df -i` và socket để phân biệt.

Tạo một lỗi ở mỗi lượt bằng lab đã học, ghi timestamp chính xác, rồi đưa hệ thống về baseline. Không tạo nhiều lỗi cùng lúc ở vòng đầu vì khó biết biện pháp nào giải quyết nguyên nhân nào.

## 5. Mẫu postmortem

```text
Ảnh hưởng và khoảng thời gian:
SLI bị ảnh hưởng, phạm vi người dùng:
Timeline với bằng chứng:
Nguyên nhân đã chứng minh:
Yếu tố góp phần:
Biện pháp giảm ảnh hưởng và kết quả:
Điều chưa biết:
Hành động phòng ngừa, người phụ trách, hạn hoàn thành:
Cách kiểm chứng hành động có hiệu quả:
```

“Do con người cấu hình sai” chưa đủ sâu. Tìm vì sao thay đổi lọt kiểm tra, vì sao phát hiện muộn và vì sao rollback khó. Không nhất thiết mọi incident chỉ có một root cause đơn lẻ.

## 6. Kiểm tra đạt

Nộp evidence bundle, timeline, postmortem và runbook đã cập nhật. Bảo vệ một quyết định thêm tài nguyên và một quyết định sửa phần mềm bằng số liệu; nêu failure domain còn tồn tại.

## Đọc thêm

`man lsof`, `man 5 proc`; [Google SRE: managing incidents](https://sre.google/sre-book/managing-incidents/), [postmortem culture](https://sre.google/sre-book/postmortem-culture/).
