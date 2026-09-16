# Bài 24 — Nền tảng mạng Linux

[Mục lục](../README.md) · [← Bài 23](23-driver-va-io.md) · [Bài 25 →](25-service-firewall.md)

## Mục tiêu

Cần bài 15; hai VM cùng mạng lab nếu muốn thử liên máy. Phân biệt địa chỉ, định tuyến, tên miền và kết nối transport để khoanh vùng lỗi.

## 1. Từ ứng dụng đến gói tin

Ứng dụng dùng socket với địa chỉ/port. TCP cung cấp luồng byte có thứ tự và cơ chế truyền lại; nó không giữ ranh giới message ứng dụng. UDP giữ datagram nhưng không tự cung cấp reliability như TCP. IP định tuyến packet; Ethernet phục vụ link cục bộ; MAC không thay địa chỉ IP để route qua Internet.

IPv4 subnet mask xác định phần mạng. Ví dụ `192.168.50.10/24` có mạng `192.168.50.0/24`; gói đến địa chỉ cùng mạng thường đi trực tiếp qua neighbor, còn ngoài mạng theo route phù hợp. Kernel chọn longest-prefix match trước khi xét các quy tắc khác trong cấu hình thông thường.

ARP tìm MAC cho IPv4 trên link; IPv6 dùng Neighbor Discovery. IPv6 không chỉ là IPv4 với địa chỉ dài hơn: cần hiểu link-local, ICMPv6 và route riêng.

## 2. DNS, DHCP và gateway

DNS ánh xạ tên và các record; DHCP có thể cấp địa chỉ, gateway và resolver. Default gateway là route dự phòng, không phải DNS server. DNS hỏng có thể làm truy cập bằng tên thất bại trong khi IP vẫn kết nối được.

`/etc/resolv.conf` có thể là file được resolver manager tạo ra hoặc symlink. Sửa tay có thể bị ghi đè; xác định NetworkManager, systemd-resolved hoặc công cụ distro trước khi thay cấu hình lâu dài.

## 3. Lab: chẩn đoán theo tầng

```bash
ip -br link
ip -br addr
ip route
ip -6 route
ip neigh
ss -lnt
curl --fail http://127.0.0.1:8080/
```

Service bài 15 chỉ bind loopback, nên VM khác chưa truy cập được: đây là thiết kế hiện tại, không phải lỗi route. Quan sát với `ss -lntp` bằng sudo nếu cần thấy process sở hữu socket.

Để học hai máy, ghi địa chỉ thực của VM B rồi trên A chạy `ip route get DIA_CHI_B`. Nếu cần phân tích DNS, dùng `getent ahosts example.com` để đi qua cơ chế name service và `dig example.com` để truy vấn DNS; chúng không hoàn toàn cùng đường xử lý.

## 4. Lab packet capture loopback

Terminal thứ nhất:

```bash
sudo timeout 10s tcpdump -ni lo -c 20 'tcp port 8080'
```

Terminal thứ hai chạy curl service. Xác định SYN, SYN-ACK, ACK, truyền dữ liệu và đóng kết nối. Đừng cho rằng một dòng capture tương ứng một message HTTP; TCP có segmentation/coalescing và offload ảnh hưởng quan sát.

## 5. Bảng khoanh vùng

| Dấu hiệu | Giả thuyết đầu tiên cần kiểm tra |
|---|---|
| Interface down/không địa chỉ | Link, cấu hình, DHCP |
| Network unreachable | Route hoặc policy routing |
| Connection refused | Không listener hoặc reject chủ động |
| Timeout | Drop, đường về, service quá tải; cần capture |
| Tên không resolve nhưng IP được | Resolver, DNS, search domain |

## 6. Mẹo và kiểm tra đạt

Ping dùng ICMP; firewall có thể chặn ICMP nhưng cho TCP, hoặc ngược lại. Không tắt firewall toàn bộ để thử. Nộp sơ đồ hai VM, route tới peer và bản phân tích capture loopback. Phải phân biệt listener bind loopback với lỗi kết nối liên máy.

## Đọc thêm

`man ip`, `man 7 tcp`, `man 7 udp`, `man 7 ipv6`, `man ss`, `man tcpdump`.
