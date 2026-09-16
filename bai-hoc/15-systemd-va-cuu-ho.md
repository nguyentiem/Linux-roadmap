# Bài 15 — systemd, log và cứu hộ dịch vụ

[Mục lục](../README.md) · [← Bài 14](14-boot-va-shutdown.md) · [Bài 16 →](16-system-call.md)

## Mục tiêu

Cần bài 10–14, Python 3 và curl đã cài ở bài 11. Tạo service mẫu sẽ dùng tiếp trong bài mạng, bảo mật và hiệu năng.

## 1. Unit, dependency và ordering

Service quản lý process, socket unit quản lý socket kích hoạt, timer lên lịch, mount quản lý mount point, target nhóm các unit theo mục tiêu. `Wants=`/`Requires=` thể hiện quan hệ kéo unit vào giao dịch với mức ràng buộc khác nhau; `After=` chỉ quy định thứ tự nếu các unit cùng được khởi động.

`start` chạy ngay; `enable` cấu hình liên kết khởi động theo target; `enable --now` làm cả hai. `daemon-reload` đọc lại định nghĩa unit nhưng không tự restart service. `reload` yêu cầu ứng dụng nạp lại cấu hình nếu có hỗ trợ, khác restart tạo vòng đời mới.

## 2. Lab: HTTP service cục bộ

Xác nhận chưa có user/unit tên `linuxlab`/`linux-lab-http` trước khi tạo. Đây là HTTP server để học, không dùng phục vụ production hoặc secret.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin linuxlab
sudo install -d -o root -g root -m 0755 /srv/linux-lab-web
printf 'Linux lab ready\n' | sudo tee /srv/linux-lab-web/index.html >/dev/null
sudo chmod 0644 /srv/linux-lab-web/index.html
```

Lưu nội dung dưới vào `/etc/systemd/system/linux-lab-http.service` bằng `sudoedit`:

```ini
[Unit]
Description=Linux course HTTP lab
After=network.target

[Service]
Type=simple
User=linuxlab
Group=linuxlab
WorkingDirectory=/srv/linux-lab-web
ExecStart=/usr/bin/python3 -m http.server 8080 --bind 127.0.0.1
Restart=on-failure
RestartSec=2s
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

Kiểm tra đường dẫn Python và nologin trên distro của bạn. `network.target` không chứng minh mạng ngoài sẵn sàng; service này chỉ bind loopback nên không cần đợi Internet.

```bash
sudo systemd-analyze verify /etc/systemd/system/linux-lab-http.service
sudo systemctl daemon-reload
sudo systemctl enable --now linux-lab-http.service
curl --fail http://127.0.0.1:8080/
systemctl status linux-lab-http.service --no-pager
journalctl -u linux-lab-http.service -b -n 30 --no-pager
```

## 3. Tạo lỗi và sửa có bằng chứng

Dùng `sudo systemctl edit linux-lab-http.service` tạo drop-in:

```ini
[Service]
WorkingDirectory=/srv/linux-lab-does-not-exist
```

Restart, quan sát trạng thái và journal. Bạn cần tìm lỗi working directory thay vì chỉ thấy vòng restart. Sửa drop-in về `/srv/linux-lab-web`, chạy daemon-reload, `reset-failed` nếu chạm rate limit, rồi restart và curl lại.

Nếu muốn dọn toàn bộ lab sau giáo trình, disable/stop unit trước, xóa đúng unit/drop-in đã tạo, daemon-reload, rồi mới xóa dữ liệu và user lab. Không dùng `systemctl revert` nếu unit có những thay đổi khác cần giữ.

## 4. Cứu hộ và log

`journalctl -b -1` xem boot trước nếu journal còn giữ. Log có thể volatile; thiết lập persistence/retention phù hợp thay vì giả định log luôn tồn tại. `systemd-analyze blame` chỉ cho một góc timing, không tự xác định nguyên nhân boot chậm.

Khi emergency do mount, dùng console VM, đọc journal và kiểm tra `fstab` bằng `findmnt --verify --verbose`. Đối chiếu UUID với `lsblk -f`; sửa đúng entry rồi thử mount có kiểm soát. Không chạy `fsck` sửa trên filesystem đang mounted.

## 5. Timer và tác vụ định kỳ

Cron chạy lệnh theo lịch và môi trường riêng; systemd timer kích hoạt một unit, tận dụng journal và quản lý dependency. Không cấu hình cả hai chạy cùng một backup nếu không có khóa chống trùng.

Để học timer mà không tạo tác vụ backup tự động, tạo `/etc/systemd/system/linux-lab-tick.service`:

```ini
[Unit]
Description=Course timer marker

[Service]
Type=oneshot
ExecStart=/usr/bin/printf "Linux course timer fired\\n"
```

Tạo file cùng tên đuôi `.timer`:

```ini
[Unit]
Description=Course timer demonstration

[Timer]
OnActiveSec=10s
AccuracySec=1s
Unit=linux-lab-tick.service
```

Chạy daemon-reload rồi `sudo systemctl start linux-lab-tick.timer`; xem `systemctl list-timers --all` và journal của `linux-lab-tick.service` sau khoảng 10 giây. Dừng timer và xóa hai file khi hoàn thành, rồi daemon-reload. Không cần enable timer này; mục tiêu là kích hoạt một lần để quan sát.

Lịch thực có thể dùng `OnCalendar=`; kiểm tra biểu thức bằng `systemd-analyze calendar`. `Persistent=true` với calendar timer hỗ trợ chạy bù khi bỏ lỡ trong thời gian timer không hoạt động, không phát lại riêng từng lần đã bỏ lỡ. Phân biệt thời gian theo wall clock với timer tương đối; timezone/DST cần được cân nhắc khi đặt lịch nghiệp vụ.

## 6. Kiểm tra đạt

Service sống qua reboot, chạy dưới user `linuxlab`, curl trả nội dung đúng và lab lỗi đã phục hồi. Giải thích vì sao active không bảo đảm ứng dụng phục vụ được, và vì sao `After=` không tự start dependency.

## Đọc thêm

`man systemd.unit`, `man systemd.service`, `man systemd.exec`, `man journalctl`, `man systemctl` của phiên bản cài trên máy.
