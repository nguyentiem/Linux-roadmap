# Bài 01 — Nền tảng máy tính và hệ điều hành

[Mục lục](../README.md) · [Bài 02 →](02-linux-va-distro.md)

## Mục tiêu và chuẩn bị

Không yêu cầu kiến thức Linux trước đó. Sau bài này, bạn phải giải thích được CPU thực thi chương trình, bộ nhớ giữ dữ liệu và hệ điều hành chia sẻ tài nguyên như thế nào. Phần lệnh có thể thực hiện sau khi cài VM ở bài 05.

## 1. Từ chương trình đến CPU

Chương trình trên đĩa là dữ liệu. Khi chạy, hệ điều hành tạo tiến trình và thiết lập không gian địa chỉ để CPU lấy lệnh, giải mã rồi thực thi. Thanh ghi giữ trạng thái đang xử lý: vị trí lệnh, toán hạng, con trỏ stack. CPU không trực tiếp hiểu Python hoặc Bash; interpreter của chúng là chương trình mã máy đang thực thi.

Một socket CPU có thể chứa nhiều core. Một core có thể cung cấp nhiều hardware thread nhờ SMT, nhưng các thread đó vẫn chia sẻ một số tài nguyên thực thi. Vì thế 8 logical CPU không mặc nhiên bằng 8 core vật lý. Trong VM, vCPU còn phải được hypervisor lập lịch lên tài nguyên host.

## 2. Thứ bậc bộ nhớ

```text
Register → cache L1/L2/L3 → RAM → SSD/HDD
  thường nhanh, nhỏ             thường chậm hơn, lớn hơn
```

Cache giữ bản sao dữ liệu để giảm thời gian chờ RAM. Locality theo thời gian nghĩa là dữ liệu vừa dùng có thể được dùng lại; locality theo không gian nghĩa là địa chỉ gần nhau có thể được truy cập tiếp. Duyệt mảng liên tiếp thường thuận lợi hơn truy cập con trỏ rải rác.

RAM lưu trạng thái đang hoạt động và thường mất dữ liệu khi mất điện. Storage giữ dữ liệu lâu dài, nhưng ghi vào bộ đệm RAM chưa đồng nghĩa dữ liệu đã bền vững trên thiết bị. Bài 23 sẽ giải thích writeback và `fsync`.

## 3. Interrupt, timer và DMA

Interrupt cho phép thiết bị báo sự kiện để CPU xử lý, thay vì CPU luôn hỏi thiết bị đã xong chưa. Timer tạo cơ sở để hệ điều hành theo dõi thời gian và đánh giá việc chuyển task. DMA cho phép thiết bị truyền dữ liệu với bộ nhớ mà CPU không phải sao chép từng byte; CPU và driver vẫn thiết lập, đồng bộ và xử lý hoàn tất.

Hệ điều hành cung cấp ba chức năng cốt lõi: trừu tượng hóa thiết bị, phân phối tài nguyên và cách ly hoạt động. Tiến trình nhìn thấy file thay cho chi tiết sector, không gian địa chỉ riêng thay cho toàn bộ RAM vật lý.

## 4. Lab: lập hồ sơ máy

Trong terminal Linux, chạy các lệnh chỉ đọc:

```bash
lscpu
free -h
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
cat /proc/cpuinfo | head -n 25
cat /proc/meminfo | head
```

Ghi số socket, core/socket, thread/core, logical CPU; tổng RAM; thiết bị chứa `/`. Nếu trường topology không xuất hiện trong VM, ghi rõ giới hạn quan sát thay vì suy ra cấu hình host. `lsblk` cũ có thể dùng `MOUNTPOINT` thay `MOUNTPOINTS`.

Đầu ra cần nộp là sơ đồ máy cùng bảng cấu hình. Giải thích vì sao dung lượng đĩa không cộng vào RAM và vì sao tăng logical CPU không đảm bảo ứng dụng nhanh tuyến tính.

## 5. Mẹo và lỗi thường gặp

- Phân biệt MB với MiB khi so sánh số liệu; công cụ có thể dùng hệ đơn vị khác nhau.
- Latency là thời gian một yêu cầu mất để hoàn tất; throughput là lượng công việc hoàn thành trong một khoảng thời gian.
- Phần trăm CPU phụ thuộc công cụ: một tiến trình đa luồng có thể vượt 100% khi 100% tương ứng một logical CPU.

## 6. Tự kiểm tra

1. CPU chờ RAM có nghĩa là ổ đĩa chậm không? **Không; đó là các tầng khác nhau.**
2. Vì sao DMA vẫn cần driver? **Driver cấu hình giao dịch và xử lý đồng bộ/hoàn tất.**
3. Một chương trình chỉ dùng một thread có tận dụng toàn bộ 8 core không? **Không tự động; cần phần việc song song và phần mềm hỗ trợ.**

## Đọc thêm

Tra `man lscpu`, `man free`, `man lsblk`; xem định nghĩa trường trong manual trước khi diễn giải số liệu.
