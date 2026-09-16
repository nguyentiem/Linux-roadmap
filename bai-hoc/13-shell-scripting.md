# Bài 13 — Shell scripting có kiểm soát lỗi

[Mục lục](../README.md) · [← Bài 12](12-process-thread-signal.md) · [Bài 14 →](14-boot-va-shutdown.md)

## Mục tiêu

Cần bài 06–12. Viết script có hợp đồng đầu vào/đầu ra, chạy lại được và không báo thành công khi tác vụ chính thất bại.

## 1. Thiết kế trước khi viết lệnh

Xác định argument, điều kiện hợp lệ, file tạo ra, exit code và cách dọn file tạm. Function nhóm một trách nhiệm; biến local giảm ghi đè ngoài ý muốn. Quote expansion, dùng mảng Bash khi giữ danh sách argument và tránh `eval` cho dữ liệu đầu vào.

`set -e` có ngoại lệ theo ngữ cảnh như điều kiện `if` và các danh sách lệnh. Nó không thay kiểm tra lỗi có chủ đích. `pipefail` làm lỗi pipeline dễ thấy hơn nhưng cần hiểu SIGPIPE khi consumer kết thúc sớm.

## 2. Lab: script backup thư mục tĩnh

Script này chỉ dành cho dữ liệu lab không bị ghi trong lúc backup, chưa phải backup database. Cần GNU tar và `flock` từ util-linux. Lưu thành `~/linux-lab/backup.sh`:

```bash
#!/usr/bin/env bash
set -u
set -o pipefail

if (( $# != 2 )); then
    printf 'Usage: %s SOURCE_DIR DEST_DIR\n' "$0" >&2
    exit 2
fi
src=$(realpath -e -- "$1") || exit 2
[[ -d "$src" ]] || { printf 'Source is not a directory\n' >&2; exit 2; }
mkdir -p -- "$2" || exit 1
dst=$(realpath -e -- "$2") || exit 2
if [[ "$src" == / || "$dst" == "$src" || "$dst" == "$src/"* ]]; then
    printf 'Destination must be outside source; source cannot be /\n' >&2
    exit 2
fi
umask 077
exec 9>"$dst/.backup.lock" || exit 1
flock -n 9 || { printf 'Backup already running\n' >&2; exit 3; }
tmp=$(mktemp "$dst/.archive.XXXXXX") || exit 1
trap 'rm -f -- "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! tar -czf "$tmp" -C "$src" .; then
    printf 'Archive failed\n' >&2
    exit 1
fi
tar -tzf "$tmp" >/dev/null || exit 1
target="$dst/backup-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
mv -- "$tmp" "$target" || exit 1
printf '%s\n' "$target"
```

File tạm nằm cùng thư mục đích để rename không phải copy qua filesystem. Lock tránh hai bản script dùng cùng đích chạy đồng thời. Đây không phải giao thức khóa cho nhiều máy dùng storage từ xa.

## 3. Chạy và kiểm chứng

```bash
mkdir -p "$HOME/linux-lab/source" "$HOME/linux-lab/backups"
printf 'version one\n' > "$HOME/linux-lab/source/data.txt"
bash -n "$HOME/linux-lab/backup.sh"
bash "$HOME/linux-lab/backup.sh" "$HOME/linux-lab/source" "$HOME/linux-lab/backups"
```

Cài ShellCheck nếu cần rồi chạy `shellcheck ~/linux-lab/backup.sh`. Chọn archive được script in ra, giải nén vào thư mục trống và `diff -r` với source. Thử thiếu argument và source không tồn tại; phải nhận status lỗi và không có archive hoàn chỉnh mới.

## 4. Giới hạn và mẹo

Script chưa có retention, remote copy, checksum manifest, mã hóa hoặc application consistency. Không gọi nó là backup production hoàn chỉnh. `tar -t` chỉ kiểm tra đọc được archive, không chứng minh dữ liệu đáp ứng nhu cầu phục hồi.

Không bật `set -x` quanh secret vì nó có thể ghi argument đã expansion. Cron có PATH và working directory khác phiên terminal; dùng đường dẫn rõ và log exit status.

## 5. Tự kiểm tra

Vì sao destination nằm trong source bị từ chối? **Để tránh backup tự bao gồm dữ liệu backup đang sinh ra.** Vì sao `trap EXIT` hữu ích? **Dọn file tạm ở cả đường thành công và lỗi thông thường; nó không chạy sau SIGKILL hoặc mất điện.**

## Đọc thêm

`help trap`, `man flock`, `man mktemp`; [ShellCheck](https://www.shellcheck.net/).
