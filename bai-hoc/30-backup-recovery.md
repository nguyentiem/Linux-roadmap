# Bài 30 — Backup, recovery và quản lý thay đổi

[Mục lục](../README.md) · [← Bài 29](29-observability.md) · [Bài 31 →](31-phuong-phap-hieu-nang.md)

## Mục tiêu

Cần bài 13, 22, 29. Khôi phục dữ liệu vào nơi độc lập, đo RPO/RTO và thiết kế thay đổi có rollback cụ thể.

## 1. Backup nhất quán ở tầng nào?

File copy có thể nhất quán cho dữ liệu tĩnh nhưng không cho database đang cập nhật nhiều file. Crash-consistent snapshot mô phỏng trạng thái sau mất điện; application-consistent backup phối hợp với ứng dụng để tạo điểm khôi phục hợp lệ theo giao thức của nó.

Full backup giữ toàn bộ phạm vi; incremental giữ thay đổi theo chuỗi. Mất mắt xích có thể làm restore thất bại. Retention không chỉ là số ngày: phải tính tốc độ dữ liệu, thời gian phát hiện hỏng, quy định lưu giữ và khả năng truy cập khóa giải mã.

## 2. Lab: backup và restore dữ liệu tĩnh

Dùng script bài 13 hoặc tạo archive tương đương. Source phải tĩnh trong lúc kiểm tra:

```bash
mkdir -p "$HOME/linux-lab/recovery/source"
cd "$HOME/linux-lab/recovery"
printf 'order-001\n' > source/orders.txt
printf 'release=1\n' > source/config.txt
(cd source && sha256sum config.txt orders.txt) > manifest.sha256
tar -czf backup.tar.gz -C source .
mkdir restore
tar -xzf backup.tar.gz -C restore
(cd restore && sha256sum -c ../manifest.sha256)
diff -r source restore
```

Đây là tên file fixture cố định, nên manifest đơn giản phù hợp. Với tên tùy ý, cần định dạng an toàn cho newline và quy trình tool hỗ trợ. Tạo nội dung mới trong source sau backup rồi restore lần nữa vào thư mục mới; dữ liệu sau điểm backup không tự xuất hiện. Ghi đó là phần mất dữ liệu trong giả lập RPO.

Đo thời gian từ lúc bắt đầu khôi phục đến lúc ứng dụng đọc dữ liệu đúng, bao gồm chuẩn bị máy, khóa, cấu hình và kiểm tra. Chỉ thời gian giải nén chưa phải RTO toàn dịch vụ.

## 3. Nhánh database

Với PostgreSQL, logical backup bằng `pg_dump` và restore bằng `pg_restore`/`psql` tùy format; backup physical và WAL phục vụ mục tiêu khác, bao gồm PITR khi thiết kế đầy đủ. Dùng công cụ tương thích phiên bản và account phù hợp; không sao chép thư mục data đang chạy để thay thế quy trình backup đã được hỗ trợ.

Bài tập: tạo database thử với vài bản ghi, dump theo manual phiên bản, restore sang database mới, kiểm tra count và truy vấn nghiệp vụ. Không ghi mật khẩu trong command line; dùng cơ chế xác thực/file credential được bảo vệ phù hợp.

## 4. Runbook thay đổi

Trước thay đổi, ghi version ứng dụng/config/schema, health baseline, backup có thể restore và điều kiện abort. Canary đưa thay đổi tới phạm vi nhỏ; mở rộng khi error/latency đạt tiêu chí. Rollback cần chỉ rõ artifact nào quay lại và dữ liệu mới sẽ được xử lý thế nào.

Migration schema kiểu expand/contract thường hỗ trợ giai đoạn hai version cùng tồn tại tốt hơn đổi phá tương thích ngay. Dù vậy phải thiết kế theo ứng dụng cụ thể; downgrade binary không tự undo dữ liệu.

## 5. Mẹo và lỗi thường gặp

- Snapshot trên cùng host không bảo vệ khỏi mất host hoặc tài khoản quản trị bị chiếm.
- Backup mã hóa mà mất key là backup không dùng được; restore drill phải bao gồm lấy key.
- Checksum giống chứng minh byte của fixture giống, chưa chứng minh ứng dụng đủ dependency để chạy.
- Không restore đè source ngay ở lần thử đầu; dùng đích mới để so sánh và tránh mất bằng chứng.

## 6. Kiểm tra đạt

Nộp manifest, kết quả restore, thời gian đo, RPO/RTO giả định và runbook rollback một release service. Trả lời: backup thành công có phải đã đạt RTO? **Không; phải diễn tập toàn đường phục hồi.**

## Đọc thêm

`man tar`, `man sha256sum`; [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html), chọn tài liệu khớp phiên bản triển khai.
