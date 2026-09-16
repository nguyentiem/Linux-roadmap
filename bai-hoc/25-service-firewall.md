# Bài 25 — Dịch vụ mạng, reverse proxy và firewall

[Mục lục](../README.md) · [← Bài 24](24-mang-linux.md) · [Bài 26 →](26-xac-thuc-va-mac.md)

## Mục tiêu

Cần bài 15 và 24. Dựng proxy trước backend và theo được luồng gói qua socket, routing, firewall. Dùng VM với console; không thay firewall của máy host đang làm việc.

## 1. Listener và reverse proxy

Listener `127.0.0.1:8080` nhận kết nối loopback trong network namespace đó. `0.0.0.0` bind mọi địa chỉ IPv4 local phù hợp, không có nghĩa vượt firewall. Listener IPv6 `::` có nhận IPv4-mapped hay không phụ thuộc socket option/cấu hình; kiểm tra thực tế.

Reverse proxy nhận request client, có thể kết thúc TLS rồi tạo kết nối đến upstream. Hai kết nối có timeout và lỗi riêng. Header forwarding chỉ tin khi do proxy đáng tin thiết lập; không dùng header client tự gửi làm danh tính xác thực.

## 2. Lab: Nginx proxy cục bộ

Cài Nginx bằng package manager trong VM. Trên hệ có include `/etc/nginx/conf.d/*.conf`, lưu file `/etc/nginx/conf.d/linux-lab.conf`:

```nginx
server {
    listen 127.0.0.1:8081;
    server_name localhost;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
curl --fail http://127.0.0.1:8081/
sudo systemctl stop linux-lab-http
curl -i http://127.0.0.1:8081/
sudo systemctl start linux-lab-http
curl --fail http://127.0.0.1:8081/
```

Nếu Nginx chưa chạy, start trước reload. Khi backend dừng, thường nhận 502; đọc error log để xác định connection refused. Mục tiêu là phân biệt proxy vẫn sống với upstream hỏng.

## 3. Firewall và connection tracking

Packet đến máy có thể đi input nếu đích local hoặc forward nếu chuyển tiếp. Packet do máy tạo đi output. NAT sửa địa chỉ/port tại hook phù hợp; connection tracking giữ trạng thái để liên kết các chiều của flow. “Established” trong firewall không đồng nghĩa người dùng đã được ứng dụng xác thực.

Với nftables, table chứa chain/rule; family `inet` hỗ trợ IPv4 và IPv6. Thứ tự rule và priority giữa base chain ảnh hưởng kết quả. Không trộn thao tác trực tiếp với firewalld/ufw đang quản lý nếu chưa hiểu ownership.

## 4. Lab firewall không làm mất SSH

Trước tiên chỉ đọc `sudo nft list ruleset`. Trong VM có nftables và chưa có table `linux_course`, thêm rule đếm packet cổng proxy, không đặt policy drop:

```bash
sudo nft add table inet linux_course
sudo nft 'add chain inet linux_course input { type filter hook input priority 10; policy accept; }'
sudo nft add rule inet linux_course input tcp dport 8081 counter
curl --fail http://127.0.0.1:8081/
sudo nft list table inet linux_course
sudo nft delete table inet linux_course
```

Counter tăng chứng minh packet đi qua chain. Rule này không phải hardening hoàn chỉnh. Bài tập mở rộng: trên VM clone có console, thiết kế policy cho loopback, established/related, SSH từ subnet quản trị và HTTP; kiểm tra cả kết nối mới và rollback trước khi lưu lâu dài.

## 5. TLS, SSH và kiểm tra đạt

TLS cần đúng hostname, trust chain, hạn dùng và đồng hồ. Không dùng `curl -k` như cách sửa xác minh certificate. SSH server host key xác thực máy chủ; user key phục vụ xác thực tài khoản. Khi đổi SSH/firewall, giữ phiên hiện tại và thử phiên mới trước khi đóng.

Nộp sơ đồ client → proxy → backend, log 502, phục hồi curl và counter firewall. Giải thích vì sao timeout không tự chứng minh firewall drop.

## Đọc thêm

`man nft`, `man ssh`, `man sshd_config`; [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [nftables wiki](https://wiki.nftables.org/).
