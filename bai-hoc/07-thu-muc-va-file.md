# Bài 07 — Cây thư mục và các loại file

[Mục lục](../README.md) · [← Bài 06](06-terminal-va-shell.md) · [Bài 08 →](08-file-va-luong-du-lieu.md)

## Mục tiêu

Sau bài 06, dùng đường dẫn chính xác và hiểu dữ liệu nào bền vững, dữ liệu nào do kernel tạo ra. Chuẩn bị thư mục `~/linux-lab`.

## 1. Một cây tên thống nhất

Linux có cây thư mục bắt đầu ở `/`. Một filesystem khác được gắn vào cây tại mount point; đường dẫn không nhất thiết cho biết dữ liệu nằm trên thiết bị nào. `/home` có thể cùng filesystem với `/` hoặc là mount riêng.

Đường dẫn tuyệt đối bắt đầu bằng `/`; đường dẫn tương đối được giải từ working directory. `.` là thư mục hiện tại, `..` là cha. Symlink có thể khiến cách nhìn logic của shell khác đường dẫn vật lý; so sánh `pwd` với `pwd -P`.

| Đường dẫn | Nội dung điển hình |
|---|---|
| `/etc` | Cấu hình theo máy |
| `/usr` | Chương trình, thư viện và dữ liệu hệ thống |
| `/var` | Log, cache, spool, dữ liệu thay đổi |
| `/home`, `/root` | Home user thường và root |
| `/run` | Trạng thái runtime, thường không bền qua reboot |
| `/tmp` | File tạm; chính sách dọn tùy distro |
| `/dev` | Device node và một số giao diện thiết bị |
| `/proc`, `/sys` | Giao diện ảo đến kernel, tiến trình, thiết bị |

Trên hệ merged-usr, `/bin` hoặc `/lib` có thể là symlink vào `/usr`. Đừng suy luận đó là cấu hình hỏng.

## 2. File không chỉ là văn bản

Regular file giữ chuỗi byte. Directory ánh xạ tên tới đối tượng filesystem. Symlink giữ đường dẫn đích và có thể bị dangling. FIFO, socket, character/block device có ngữ nghĩa I/O khác regular file.

`ls -l` cho biết loại bằng ký tự đầu; `stat` cho metadata; `file` nhận diện nội dung theo dấu hiệu, không chỉ đuôi tên. Một file đuôi `.txt` vẫn có thể chứa dữ liệu nhị phân.

## 3. Lab: đường dẫn, symlink và filesystem

```bash
mkdir -p "$HOME/linux-lab/paths/data"
cd "$HOME/linux-lab/paths"
printf 'sample\n' > data/report.txt
ln -s data/report.txt report-link
ls -l
stat data/report.txt
file data/report.txt
readlink report-link
findmnt -T data/report.txt
mv data/report.txt data/renamed.txt
cat report-link
```

Lệnh cuối thất bại vì symlink vẫn chứa đường dẫn cũ. Sửa bằng `ln -sfn data/renamed.txt report-link` rồi đọc lại. Symlink tương đối được giải từ thư mục chứa symlink, không từ thư mục của người gọi.

Quan sát `ls /proc/self`, `cat /proc/uptime`, `ls /sys/class/net`. Không ghi vào các pseudo-file khi chưa biết tác dụng; một số file là giao diện điều khiển kernel.

## 4. Mẹo và lỗi thường gặp

- File bắt đầu bằng dấu chấm được ẩn theo quy ước hiển thị; đó không phải cơ chế bảo mật.
- Mount lên thư mục có dữ liệu sẽ che dữ liệu cũ trong cây nhìn thấy, không tự xóa nó.
- Permission denied có thể do thiếu quyền đi qua một thư mục cha, không chỉ quyền file đích.

## 5. Kiểm tra đạt

Giải thích được symlink hỏng trong lab và vị trí filesystem thật bằng `findmnt`. Trả lời: `/proc/uptime` có cần chiếm dung lượng trên SSD như log không? **Không; đây là dữ liệu do kernel cung cấp qua pseudo-filesystem.**

## Đọc thêm

`man 7 hier`, `man 7 inode`, `man 7 symlink`, `man findmnt`.
