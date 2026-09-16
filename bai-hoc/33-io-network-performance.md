# Bài 33 — Phân tích hiệu năng I/O và mạng

[Mục lục](../README.md) · [← Bài 32](32-cpu-memory-performance.md) · [Bài 34 →](34-debug-tracing-crash.md)

## Mục tiêu

Cần bài 23–25, 31. Thiết kế benchmark có dataset, concurrency, cache và đơn vị rõ; tránh nhầm tốc độ mạng/disk với tốc độ ứng dụng.

## 1. IOPS, bandwidth và queue depth

IOPS đếm thao tác mỗi giây; bandwidth đo byte mỗi giây. Với kích thước I/O cố định, bandwidth xấp xỉ IOPS nhân kích thước, nhưng vẫn cần xét overhead và cách tool tính. 1000 IOPS ở 4 KiB khác 1000 IOPS ở 1 MiB.

Queue depth là số request outstanding. Tăng depth có thể tăng throughput nhờ song song nhưng cũng tăng latency. Sync I/O engine thường không tạo depth lớn chỉ vì bạn đặt `iodepth=32`; phải chọn engine hỗ trợ và đọc depth thực tế trong output.

## 2. Lab fio trên file riêng

Cài **Flexible I/O Tester** (`fio`) từ distro, không nhầm CLI trùng tên của phần mềm khác. Dùng thư mục mới với ít nhất 512 MiB trống, không thay filename bằng `/dev/...`:

```bash
bench_dir=$(mktemp -d "$HOME/linux-lab/fio.XXXXXX")
fio --name=prepare --filename="$bench_dir/data.bin" --size=256M \
  --rw=write --bs=1M --ioengine=psync --direct=1 --end_fsync=1
fio --name=read4k --filename="$bench_dir/data.bin" --size=256M \
  --rw=randread --bs=4k --ioengine=psync --iodepth=1 --direct=1 \
  --runtime=10 --time_based --group_reporting
```

Ghi IOPS, bandwidth, completion latency percentile và CPU sử dụng. Nếu filesystem không hỗ trợ direct I/O hoặc alignment không phù hợp, ghi lỗi và chọn filesystem lab hỗ trợ; không âm thầm đổi sang buffered rồi so như cùng phép đo. Lần mở rộng dùng buffered read phải ghi rõ cache mode. Xóa `data.bin` và thư mục tạo bởi `mktemp` sau lab.

256 MiB là fixture nhỏ để học công cụ, chưa đại diện dung lượng/steady-state của thiết bị production. Cache của thiết bị/host VM vẫn có thể ảnh hưởng direct I/O ở guest. [fio documentation](https://fio.readthedocs.io/en/latest/fio_doc.html)

## 3. Mạng: throughput không phải response time

TCP throughput phụ thuộc RTT, loss, congestion/receive window và tài nguyên hai đầu. Bandwidth-delay product cho biết lượng dữ liệu cần đang trên đường để lấp đầy link: link 100 Mbit/s, RTT 20 ms tương ứng khoảng 250 kB, bỏ qua overhead.

Retransmission có thể do loss/congestion hoặc các điều kiện khác; packet capture một phía chưa đủ xác định điểm rơi. MTU mismatch và Path MTU Discovery bị cản có thể khiến kết nối nhỏ hoạt động nhưng truyền lớn bị treo.

## 4. Lab iperf3 hai VM

Trên server lab cài iperf3 và chạy `iperf3 -s -1`; chỉ cho phép cổng thử trong mạng lab. Trên client chạy `iperf3 -c IP_SERVER -t 10`, thay IP thực. Server kết thúc sau một phép thử. Chạy lại server rồi thử `-R` để đo chiều ngược.

Trong lúc đo, xem `ss -tin`, CPU hai đầu và `ip -s link`. Kết quả iperf3 phản ánh đường truyền thử, không chứng minh HTTP/database có cùng throughput. Không gửi tải tới máy ngoài phạm vi lab của bạn.

## 5. Kiểm tra đạt

Nộp bảng workload gồm block size, engine, depth, cache mode, dataset, duration, VM/host và kết quả. Giải thích vì sao benchmark đọc file nhỏ trong RAM không đo trực tiếp tốc độ SSD, và vì sao thêm connection có thể tăng throughput nhưng tăng tail latency.

## Đọc thêm

`man fio`, `man iperf3`, `man ss`; [iperf documentation](https://software.es.net/iperf/).
