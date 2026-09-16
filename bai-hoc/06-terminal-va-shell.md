# Bài 06 — Terminal, shell và cách tự tra cứu

[Mục lục](../README.md) · [← Bài 05](05-cai-dat-va-lab.md) · [Bài 07 →](07-thu-muc-va-file.md)

## Mục tiêu

Cần VM của bài 05. Bạn sẽ phân biệt terminal với shell, dự đoán cách Bash xử lý argument và tìm đúng tài liệu khi gặp lệnh mới.

## 1. Ai xử lý câu lệnh?

Terminal là giao diện nhập/xuất ký tự. Shell đọc câu lệnh, thực hiện expansion, tạo redirect và chạy builtin hoặc chương trình ngoài. SSH có thể đưa bạn vào shell trên máy khác; terminal hiển thị vẫn ở máy của bạn.

Với `ls -l /etc`, `ls` là chương trình, `-l` là option, `/etc` là argument. Shell không hiểu đầy đủ ý nghĩa option của từng chương trình. Alias, function và builtin có thể khiến cùng một tên lệnh chạy khác mong đợi; `type -a` giúp xác định điều đó.

## 2. Quoting và expansion

Single quote giữ nội dung literal; double quote vẫn cho phép thay biến và command substitution nhưng chặn word splitting và globbing của kết quả thông thường. Không quote một biến chứa đường dẫn có khoảng trắng có thể biến một argument thành nhiều argument.

```bash
name='Linux roadmap'
printf '<%s>\n' "$name"
printf '<%s>\n' $name
printf '%s\n' '$name' "$name"
```

Dòng thứ nhất in một argument, dòng thứ hai thường in hai. `*` được shell mở rộng thành danh sách tên file khớp trước khi chương trình nhận argument; `'*'` là dấu sao literal. `--` thường kết thúc option, giúp xử lý tên bắt đầu bằng `-`.

## 3. PATH và môi trường

`PATH` là danh sách thư mục tìm executable theo thứ tự. Biến shell chỉ tồn tại trong shell hiện tại; `export` đưa biến vào môi trường cho tiến trình con. Thay môi trường của con không sửa ngược shell cha. Thư mục hiện tại thường không nằm trong PATH; chạy file local bằng `./ten-file`.

```bash
type -a printf ls cd
command -v bash
printf '%s\n' "$PATH"
course=linux
export course
bash -c 'printf "%s\n" "$course"'
```

## 4. Lab: học cách tra cứu

Chạy `help cd`, `man ls`, `man 5 passwd`. Trong `man`, dùng `/pattern` để tìm, `n` để tới kết quả tiếp, `q` để thoát. Section 1 thường là lệnh, 2 system call, 3 thư viện, 5 định dạng file, 8 quản trị.

Tạo thư mục bằng `mkdir -p "$HOME/linux-lab/with space"`, rồi dùng `cd` vào đó. Thử `cd` không quote đường dẫn để thấy shell phân tách argument; sau đó sửa bằng double quote. Không thực hành lỗi quoting với `rm`.

Đầu ra: bảng giải thích năm lệnh, chúng là builtin hay executable, manual section và số argument trong từng ví dụ quoting.

## 5. Mẹo, lỗi và tự kiểm tra

- `Ctrl+C` thường gửi SIGINT đến foreground process group; `Ctrl+D` báo hết đầu vào khi phù hợp, không phải tín hiệu kill.
- `command not found`: kiểm tra tên, PATH và package; `permission denied`: kiểm tra quyền chạy và mount, không mặc định cài lại.
- Vì sao `cd` phải tác động trong shell hiện tại? **Một tiến trình con không đổi được working directory của cha.**
- Vì sao `echo` không luôn phù hợp với dữ liệu tùy ý? **Cách xử lý option/escape khác nhau; `printf '%s\n' "$value"` rõ hơn.**

## Đọc thêm

`man bash`, `help type`, `help export`; [GNU Bash manual](https://www.gnu.org/software/bash/manual/).
