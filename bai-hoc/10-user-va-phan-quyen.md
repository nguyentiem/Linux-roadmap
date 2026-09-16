# Bài 10 — User, group và quyền truy cập

[Mục lục](../README.md) · [← Bài 09](09-xu-ly-van-ban.md) · [Bài 11 →](11-package-va-thu-vien.md)

## Mục tiêu

Cần bài 07–08, VM có sudo. Hiểu quyết định quyền theo UID/GID và sửa lỗi truy cập ở đúng tầng.

## 1. Danh tính và quyền cơ bản

Kernel chủ yếu xử lý UID/GID số; tên được tra cứu qua cơ chế user space. Một tiến trình có danh tính và nhóm bổ sung. `id` cho biết danh tính shell đang dùng, không chỉ cấu hình tài khoản trên đĩa.

Quyền truyền thống chia owner, group, other. Hệ thống chọn lớp phù hợp, không cộng tất cả các lớp tùy ý. Với regular file, `r` là đọc nội dung, `w` là ghi, `x` là thực thi. Với directory, `r` là liệt kê tên, `x` là tìm/truy cập thành phần, `w` là sửa các entry, thường cần cùng `x`.

Vì vậy file không writable vẫn có thể bị xóa nếu người dùng được sửa thư mục chứa nó. Sticky bit trên thư mục giới hạn việc xóa/đổi tên theo sở hữu và đặc quyền, như ở `/tmp`.

## 2. umask, setgid và ACL

`umask` loại bỏ bit quyền từ mode ứng dụng yêu cầu, không phải phép trừ số thông thường. Với yêu cầu 0666 và umask 0022, file thường thành 0644; directory yêu cầu 0777 thành 0755. Ứng dụng có thể yêu cầu quyền hẹp hơn.

Setgid trên thư mục giúp file con kế thừa group. Default ACL quy định ACL kế thừa; ACL mask có thể giới hạn quyền hiệu lực của named user/group. Setuid executable là cơ chế đặc quyền cần kiểm soát, không phải cách tiện để bỏ qua sudo.

## 3. Lab: thư mục cộng tác

Chỉ tạo tài khoản sau khi xác nhận tên chưa tồn tại bằng `getent passwd labalice` và `getent group labteam`. Nếu trùng, chọn tên lab khác và thay nhất quán.

```bash
sudo groupadd labteam
sudo useradd -m -s /bin/bash labalice
sudo usermod -aG labteam labalice
sudo install -d -o root -g labteam -m 2770 /srv/linux-team-lab
sudo -u labalice sh -c 'umask 0002; printf "hello\n" > /srv/linux-team-lab/note.txt'
ls -ld /srv/linux-team-lab
ls -l /srv/linux-team-lab/note.txt
sudo -u labalice id
namei -l /srv/linux-team-lab/note.txt
```

File phải thuộc group `labteam`. Thử đổi directory thành 2700 rồi đọc bằng labalice để tạo lỗi; khôi phục bằng `sudo chmod 2770 /srv/linux-team-lab`. Việc khôi phục quyền là một phần của lab, không kết thúc ở quan sát lỗi.

Nếu đã cài công cụ ACL, dùng `getfacl` và thử default ACL trong một thư mục con; quan sát cột `effective` khi mask hạn chế quyền. Sau lab giữ tài khoản cho bài 26 hoặc xóa tài khoản/thư mục đã tạo khi không còn cần.

## 4. Mẹo và lỗi thường gặp

- `usermod -G` không có `-a` có thể thay toàn bộ nhóm bổ sung.
- Shell cũ không tự nhận nhóm mới; đăng nhập lại hoặc dùng phiên mới rồi kiểm tra `id`.
- Với permission denied, lần lượt kiểm tra danh tính, từng thư mục cha, ACL, mount read-only và MAC ở bài 26.
- Không sửa lỗi bằng `chmod -R 777`: có thể làm lộ dữ liệu và tạo executable không cần thiết.

## 5. Tự kiểm tra

Vì sao `cat file` chạy được nhưng `ls directory` thất bại? **Có thể có quyền search và đọc file đã biết tên nhưng thiếu quyền liệt kê directory.** Vì sao `umask 000` không tự làm file text executable? **Ứng dụng thường không yêu cầu bit x khi tạo file.**

## Đọc thêm

`man 7 credentials`, `man 7 path_resolution`, `man 5 acl`, `man chmod`, `man umask`.
