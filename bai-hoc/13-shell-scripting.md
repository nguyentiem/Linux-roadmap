# Bài 13 — Shell scripting có kiểm soát lỗi

[Mục lục](../README.md) · [← Bài 12](12-process-thread-signal.md) · [Bài 14 →](14-boot-va-shutdown.md)

## Mục tiêu: làm sao biết một script thực sự hoàn thành?

Sau bài 06–12, bạn đã chạy từng lệnh. Bài này nối chúng thành một công việc: sao lưu thư mục bài tập, chỉ công bố bản sao khi tạo thành công và biết phục hồi khi có lỗi. Bạn cần giải thích được đầu vào, đầu ra, mã kết thúc; giữ nguyên tên file có khoảng trắng; kiểm tra lỗi có chủ đích; dùng hàm, khóa và dọn file tạm; cuối cùng phục hồi bản sao để đối chiếu. Lab dành cho Bash cùng GNU coreutils, GNU tar và util-linux trên Linux; không coi các lệnh này là cú pháp tương đương trên mọi `/bin/sh` hoặc BusyBox.

## 1. Shell, script và chương trình đang chạy khác nhau thế nào?

**Shell** là chương trình đọc câu lệnh rồi quyết định chạy chương trình nào, truyền dữ liệu gì và nối các luồng dữ liệu ra sao. Ví dụ Bash hiểu `printf 'hello\n' > note.txt`: `printf` tạo văn bản, còn Bash mở file và chuyển văn bản vào đó. `printf '%s\n' "$BASH_VERSION"` cho biết phiên bản Bash hiện tại nếu bạn đang dùng Bash; `$SHELL` thường mô tả shell đăng nhập, không đảm bảo là shell đang đọc lệnh.

**Script** là file văn bản chứa các câu lệnh để shell đọc theo thứ tự và theo các điều kiện. File `backup.sh` nằm trên đĩa chưa phải **process**, tức một lần thực thi có tài nguyên và mã số PID riêng. `bash backup.sh` tạo lần thực thi của Bash đọc file; Bash có thể tạo thêm process `tar` để đóng gói dữ liệu. Kernel, phần lõi hệ điều hành, quản lý các process và việc đọc/ghi; Bash chịu trách nhiệm diễn giải ngôn ngữ script, không trở thành kernel.

Dòng `#!/usr/bin/env bash` là **shebang**: khi chạy trực tiếp file có quyền thực thi, nó chỉ ra trình thông dịch cần dùng. `env` tìm Bash theo **PATH**, danh sách thư mục tìm chương trình như `/usr/bin`. Với `bash backup.sh`, bạn đã chọn Bash nên shebang không quyết định trình thông dịch. Không chạy `sh backup.sh` rồi mặc định có các tính năng riêng của Bash.

**Permission**, hay quyền truy cập, quyết định tài khoản nào được đọc, ghi và thực thi file. `ls -l backup.sh` cho thấy các ký tự `r`, `w`, `x`; `chmod u+x backup.sh` thêm quyền thực thi cho chủ file. Lab dùng `bash ...` nên chỉ cần Bash đọc được script; không cần thêm quyền thực thi.

## 2. Trước khi viết lệnh, hợp đồng của công việc là gì?

**Argument** là một đối số, tức giá trị truyền cho chương trình khi gọi. Trong `bash backup.sh source backups`, `source` và `backups` là hai argument của script. Bash gọi chúng là `$1`, `$2`; `$#` là số argument; `"$@"` giữ từng argument riêng biệt khi chuyển tiếp. **Biến** giữ một giá trị có tên, như `src`; gán `src='source folder'` không đặt khoảng trắng quanh dấu `=`.

**Exit status** là mã kết thúc mà chương trình trả cho bên gọi: `0` thường biểu thị thành công, khác `0` biểu thị lỗi hoặc trạng thái khác theo quy ước của chương trình. `$?` chỉ giữ mã của lệnh gần nhất, nên phải lấy ngay. Không suy ra thành công chỉ vì màn hình không có chữ đỏ.

Ta chọn hợp đồng sau; mã `2` và `3` là quy ước của script này, không phải nghĩa bắt buộc của mọi công cụ:

| Phần hợp đồng | Quyết định trong lab | Vì sao cần |
|---|---|---|
| Đầu vào | Chính xác hai thư mục: nguồn và đích | Giảm suy đoán và tránh sao lưu nhầm |
| Nguồn | Tồn tại, là thư mục, không phải `/` | Lab chỉ xử lý dữ liệu nhỏ, không gom toàn bộ hệ thống |
| Đích | Nằm ngoài nguồn | Tránh archive chứa chính archive đang tạo |
| Thành công | Mã `0`, một đường dẫn archive trên stdout | Chương trình khác lấy được kết quả |
| Sai đầu vào | Mã `2`, thông báo trên stderr | Tách lỗi gọi lệnh khỏi kết quả |
| Thao tác thất bại | Mã `1`; khóa thất bại mã `3` | Bên gọi biết việc chưa hoàn tất |
| Chạy lại | Tạo bản mới, không thay dữ liệu nguồn | Đây là thiết kế chạy lại an toàn, không phải không tạo thêm file |

**stdout** là luồng kết quả thông thường; **stderr** là luồng báo lỗi độc lập. `>&2` chuyển thông báo vào stderr. **Command substitution**, viết `result=$(command)`, thu stdout của lệnh vào biến và bỏ các dấu xuống dòng cuối; stderr vẫn hiện ra. Vì thế thông báo lỗi không được trộn vào đường dẫn archive. Shell không thể lưu byte NUL trong biến; lab giới hạn đường dẫn không có dấu xuống dòng cuối vì các lệnh `realpath` và `date` được thu bằng cách này.

## 3. Vì sao dấu nháy quyết định tính đúng đắn?

**Expansion** là bước shell thay biểu thức bằng giá trị, ví dụ `"$src"` thành tên thư mục. Khi không có nháy kép, Bash còn có thể tách thành nhiều từ và mở rộng ký tự mẫu `*`, `?`, `[...]` theo tên file. Hai bước đó có thể biến một đường dẫn thành nhiều argument.

```bash
folder='source folder'
printf '<%s>\n' $folder
printf '<%s>\n' "$folder"
```

Kết quả minh họa của lệnh đầu là hai dòng `<source>` và `<folder>`, lệnh sau là một dòng `<source folder>`. Tự chạy ví dụ để thấy số argument thay đổi. Quote giá trị không vô hiệu hóa mọi ý nghĩa của công cụ nhận nó: giá trị bắt đầu `-` vẫn có thể bị công cụ hiểu là option. **Option** là tham số điều khiển hành vi như `-p`; nhiều công cụ chấp nhận `--` để kết thúc phần option. Bởi vậy lab viết `mkdir -p -- "$dst"` và `rm -f -- "$tmp"`.

**Mảng Bash** giữ danh sách nhiều giá trị tách biệt, thay vì ghép một chuỗi rồi cố tách lại. Ví dụ này chưa tạo archive, chỉ in các argument sẽ dùng:

```bash
src='/tmp/source folder'
args=(-C "$src" .)
printf '<%s>\n' "${args[@]}"
```

Bạn phải thấy ba dòng: `-C`, `/tmp/source folder`, `.`. Khi thực thi, dùng `tar ... "${args[@]}"`; `"${args[*]}"` thường ghép thành một argument. Tránh `eval` với đầu vào: nó diễn giải một chuỗi thành mã shell lần nữa; dữ liệu như dấu `;` có thể trở thành câu lệnh. Mảng và quote chuyển dữ liệu trực tiếp, không cần vòng diễn giải đó.

## 4. Có phải bật `set -e` là hết lỗi?

Không. `set` đổi tùy chọn của Bash. `set -u` báo lỗi khi mở rộng nhiều biến chưa gán; không kiểm tra một biến đã gán nhưng rỗng. `set -o pipefail` đổi mã của **pipeline**, chuỗi lệnh nối stdout lệnh trước vào stdin lệnh sau bằng `|`: thay vì chỉ lấy mã của lệnh cuối, pipeline trả mã lỗi của lệnh thất bại ngoài cùng bên phải, hoặc `0` khi tất cả thành công.

```bash
bash -c 'false | cat >/dev/null; printf "status=%s\n" "$?"'
bash -o pipefail -c 'false | cat >/dev/null; printf "status=%s\n" "$?"'
```

`false` cố ý trả `1`, `cat` đọc hết đầu vào rồi trả `0`. Bạn cần thấy `status=0` rồi `status=1`: nếu không có pipefail, lỗi ở đầu pipeline bị che bởi lệnh cuối. Đây là thử nghiệm mã trạng thái, không phải lỗi sao lưu thật.

`set -e` yêu cầu thoát trong nhiều tình huống lệnh thất bại, nhưng có ngoại lệ: lệnh đang được kiểm tra bởi `if`, các vị trí trong `&&`/`||`, và những ngữ cảnh khác. Đặc biệt một hàm gọi trong điều kiện có thể chịu các ngoại lệ đó bên trong hàm. Vì vậy lab không dùng `-e` làm cơ chế chính; từng lệnh quan trọng có kiểm tra và đường thoát rõ ràng. Đọc chính xác quy tắc trong [Bash: The Set Builtin](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html) và đối chiếu `help set` của máy.

`if ! tar ...; then` thích hợp khi chỉ cần biết thất bại. Nhưng `$?` ngay bên trong nhánh là mã của biểu thức đã đảo bởi `!`, không còn mã gốc của `tar`. Nếu cần mã gốc, dùng `if tar ...; then ...; else status=$?; ...; fi`.

**SIGPIPE** là tín hiệu kernel gửi khi một process ghi vào pipe nhưng bên đọc đã đóng. Ví dụ `yes | head -n 1`: `head` chỉ cần một dòng nên kết thúc sớm; `yes` có thể bị SIGPIPE. Bash thường biểu diễn kết thúc bởi tín hiệu bằng `128 + số tín hiệu`, trên Linux SIGPIPE thường thành `141`. Có pipefail, pipeline này có thể báo khác `0` dù bạn đã nhận đúng một dòng; phải xét mục tiêu công việc trước khi coi đó là hỏng dữ liệu.

**Function**, hay hàm, nhóm một trách nhiệm để gọi lại, như báo lỗi và thoát. `local` giới hạn biến trong phạm vi hàm giúp tránh ghi đè biến của nơi gọi. Hàm `die` bên dưới lấy mã ở `$1`, dùng `shift` bỏ argument đầu, in thông báo còn lại rồi thoát cả script. Không dùng `exit` trong hàm nếu ý định chỉ là trả lại cho nơi gọi; trường hợp đó dùng `return`.

## 5. Làm sao tránh công bố một bản sao đang viết dở?

**Archive** là file gộp nhiều file cùng thông tin tên và một phần thuộc tính. GNU tar tạo archive; gzip nén dữ liệu để giảm dung lượng. Đuôi `.tar.gz` trong lab thể hiện cả hai lớp. Đóng gói không tự chứng minh có thể phục hồi đúng: phải thử giải nén và so sánh.

**Filesystem**, tức hệ thống tổ chức lưu trữ, quản lý tên file, thư mục và dữ liệu trên một vùng lưu trữ; ext4 là một ví dụ. Thư mục nguồn và đích có thể cùng filesystem hoặc khác nhau; `findmnt -T "$HOME"` cho biết filesystem chứa một đường dẫn. Lab tạo file tạm ngay trong thư mục đích: việc chuyển tên sang tên cuối bằng `mv` thông thường dùng rename trên cùng filesystem, tránh phải copy qua filesystem rồi để lộ file đích chưa ghi hết. Điều này giúp công bố tên file nguyên vẹn cho người đọc, không phải cam kết dữ liệu đã bền vững sau mất điện; script không có giao thức `fsync` để ép dữ liệu và thư mục xuống thiết bị.

**Lock**, hay khóa phối hợp, ngăn hai bản script cùng làm ở một đích tại một thời điểm. `flock` gắn khóa vào file đang mở; `exec 9>...` mở file và giữ **file descriptor** số `9`, một số nhận diện kênh file của process. `flock -n 9` thử lấy khóa độc quyền mà không đợi. Khóa được giải phóng khi các descriptor giữ nó đóng; không xóa file khóa khi đang sử dụng vì bản khác có thể khóa một file khác cùng tên. Đây là khóa hợp tác: một chương trình không dùng flock vẫn ghi được vào thư mục. Khóa trên NFS/CIFS phụ thuộc hỗ trợ và cấu hình, xem [tài liệu flock của util-linux](https://man7.org/linux/man-pages/man1/flock.1.html).

**Trap** là quy tắc Bash chạy đoạn dọn dẹp khi nhận một số tín hiệu hoặc sự kiện. `trap ... EXIT` dọn file tạm khi Bash kết thúc bình thường hay thoát do lỗi được xử lý. `INT` thường đến từ Ctrl+C; `TERM` là yêu cầu kết thúc. Nó không chạy được sau SIGKILL, sự cố kernel hay mất điện. Khi Bash đang đợi lệnh ngoài như tar, thời điểm chạy trap cũng chịu cơ chế đợi lệnh; không coi đây là bộ điều khiển dừng tức thì.

```text
Hai đường dẫn đầu vào
  → kiểm tra và chuẩn hóa → mở khóa đích
  → tạo file tạm → tar ghi archive → tar đọc thử
  → đổi tên thành bản sao chính thức → in đường dẫn
Lỗi ở bước trước đổi tên → thoát khác 0 → trap dọn file tạm
```

Đọc từ trái sang phải: mỗi mũi tên chỉ bước chỉ được thực hiện khi bước trước thành công. Khóa bao phủ các bước từ tạo file tạm đến công bố. Dọn file tạm không xóa bản sao đã có từ trước. **UTC** là mốc giờ phối hợp chung, giúp tên không phụ thuộc múi giờ địa phương; `date -u` in theo mốc đó. Tên cuối có thời gian UTC và PID để giảm đụng tên trong lab; chưa là một giao thức đặt tên chống mọi va chạm qua nhiều máy/lần khởi động.

## 6. Lab: viết và chạy bản sao lưu có hợp đồng

### 6.1. Chuẩn bị gì trước khi chạy?

Dùng dữ liệu tĩnh: không chương trình nào sửa thư mục nguồn trong lúc sao lưu. Không dùng database đang hoạt động vì nhiều file có thể phản ánh những thời điểm khác nhau. Thư mục đích thuộc tài khoản của bạn và không cho người khác tùy ý thay file/link trong lúc chạy; đây không phải script chống đối thủ có quyền ghi vào cây thư mục.

```bash
for tool in bash tar realpath mktemp flock date mv diff; do
    command -v "$tool" || printf 'Missing: %s\n' "$tool" >&2
done
bash --version
tar --version
flock --version
mkdir -p "$HOME/linux-lab"
```

`command -v` kiểm tra tìm thấy công cụ trong PATH; nó không chứng minh phiên bản có option cần dùng. Nếu thiếu, dùng trình quản lý gói của distro đã học ở bài 11, rồi xem `--help`. Tạo file `~/linux-lab/backup.sh` trong trình soạn thảo và lưu nguyên nội dung:

```bash
#!/usr/bin/env bash
set -u
set -o pipefail

die() {
    local status=$1
    shift
    printf '%s\n' "$*" >&2
    exit "$status"
}

if (( $# != 2 )); then
    printf 'Usage: %s SOURCE_DIR DEST_DIR\n' "$0" >&2
    exit 2
fi
src=$(realpath -e -- "$1") || exit 2
[[ -d "$src" ]] || { printf 'Source is not a directory\n' >&2; exit 2; }
umask 077
mkdir -p -- "$2" || exit 1
dst=$(realpath -e -- "$2") || exit 2
if [[ "$src" == / || "$dst" == "$src" || "$dst" == "$src/"* ]]; then
    printf 'Destination must be outside source; source cannot be /\n' >&2
    exit 2
fi
exec 9>"$dst/.backup.lock" || exit 1
flock -n 9 || { die 3 'Backup already running or lock unavailable'; }
tmp=$(mktemp "$dst/.archive.XXXXXX") || exit 1
trap 'rm -f -- "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! tar -czf "$tmp" -C "$src" .; then
    printf 'Archive failed\n' >&2
    exit 1
fi
tar -tzf "$tmp" >/dev/null || exit 1
timestamp=$(date -u +%Y%m%dT%H%M%SZ) || exit 1
target="$dst/backup-$timestamp-$$.tar.gz"
mv -- "$tmp" "$target" || exit 1
printf '%s\n' "$target"
```

**Liên kết tượng trưng** là tên file chỉ sang một đường dẫn khác, như `source-link -> source folder`; `ls -l` giúp nhìn đích được trỏ tới. `realpath -e` chuẩn hóa đường dẫn đã tồn tại, giải các liên kết ấy; kiểm tra trên đường dẫn chuẩn hóa giúp phát hiện đích đi vào nguồn qua một link. `[[ ... ]]` là biểu thức kiểm tra riêng của Bash; `(( ... ))` kiểm tra số học. `umask 077` hạn chế quyền mặc định cho file/thư mục mới để các tài khoản khác không được đọc; nó không sửa quyền của thư mục đích đã có. `mktemp` tạo tên tạm khó đoán và file thật, tránh kiểu tự chọn `/tmp/backup.tmp` rồi bị dùng trùng.

`tar -czf` có `c` là tạo, `z` là gzip, `f` là tên file archive; `-C "$src"` đổi thư mục làm việc của tar và `.` chọn cây nguồn. Bởi vậy archive lưu đường dẫn tương đối, không cần giải nén lên đường dẫn gốc. `tar -tzf` có `t` là liệt kê: thử đọc cấu trúc archive, nhưng chưa xác nhận dữ liệu ứng dụng nhất quán. `>/dev/null` bỏ kết quả liệt kê, vẫn giữ báo lỗi.

### 6.2. Tạo dữ liệu có khoảng trắng, chạy và lấy kết quả

```bash
mkdir -p "$HOME/linux-lab/source folder" "$HOME/linux-lab/backups"
printf 'version one\n' > "$HOME/linux-lab/source folder/data file.txt"
bash -n "$HOME/linux-lab/backup.sh"
if archive=$(bash "$HOME/linux-lab/backup.sh" \
    "$HOME/linux-lab/source folder" "$HOME/linux-lab/backups"); then
    printf 'Created: %s\n' "$archive"
else
    status=$?
    printf 'Backup failed: status=%s\n' "$status" >&2
fi
```

Chỉ tiếp tục phục hồi nếu nhánh `Created` chạy. `bash -n` đọc cú pháp mà không thực thi; không chứng minh logic đúng. Đường dẫn minh họa có dạng `/home/ban/linux-lab/backups/backup-20260101T120000Z-12345.tar.gz`; thời gian, PID, tên home trên máy bạn sẽ khác. Kiểm tra `tar -tzf "$archive"`: phải thấy `./` và `./data file.txt`. stdout chỉ có đường dẫn nên command substitution lấy được trực tiếp.

### 6.3. Phục hồi vào thư mục mới, không đè dữ liệu nguồn

```bash
restore_dir=$(mktemp -d "$HOME/linux-lab/restore.XXXXXX")
tar -xzf "$archive" -C "$restore_dir"
diff -r -- "$HOME/linux-lab/source folder" "$restore_dir"
status=$?
printf 'diff status=%s\n' "$status"
```

Kiểm tra mỗi lệnh thành công trước lệnh kế tiếp; nếu `mktemp` hoặc `tar` lỗi, dừng để đọc stderr. `x` là giải nén; thư mục đích trống mới tạo giúp không ghi đè dữ liệu hiện có. `diff -r` đối chiếu cây thư mục: mã `0` và không có nội dung khác biệt cho biết dữ liệu văn bản lab giống nhau; `1` là có khác biệt; lớn hơn `1` thường là lỗi đọc/so sánh. Không suy ra quyền, chủ sở hữu, các thuộc tính mở rộng hoặc metadata đặc biệt đều được phục hồi chỉ từ diff. Chỉ giải nén archive do bạn tin cậy; lab này không kiểm tra archive nhận từ bên ngoài.

### 6.4. Thử lỗi có chủ đích và khóa

```bash
bash "$HOME/linux-lab/backup.sh"
printf 'missing args status=%s\n' "$?"
bash "$HOME/linux-lab/backup.sh" \
    "$HOME/linux-lab/no-such-source" "$HOME/linux-lab/backups"
printf 'missing source status=%s\n' "$?"
bash "$HOME/linux-lab/backup.sh" \
    "$HOME/linux-lab/source folder" "$HOME/linux-lab/source folder/backups"
printf 'destination inside source status=%s\n' "$?"
```

Cả ba trường hợp cần mã `2`, không tạo archive chính thức. Trường hợp cuối có thể tạo thư mục `backups` rỗng trong nguồn rồi mới bị từ chối: script tạo đích trước khi chuẩn hóa; chạy lại an toàn không đồng nghĩa không có tác động nào khi đầu vào sai. Xóa riêng thư mục rỗng này bằng `rmdir "$HOME/linux-lab/source folder/backups"` sau thử nghiệm; `rmdir` sẽ từ chối nếu có dữ liệu.

Để kiểm chứng khóa một cách xác định, mở terminal A và giữ descriptor trong 20 giây:

```bash
flock "$HOME/linux-lab/backups/.backup.lock" sleep 20
```

Trong thời gian đó, ở terminal B chạy lại script đúng hai argument rồi đọc `$?`; cần mã `3`. Sau 20 giây chạy lại cần thành công. Một lỗi quyền hoặc filesystem không hỗ trợ khóa cũng có thể tạo mã `3` trong script này: thông báo không đủ chứng minh chắc chắn có bản sao lưu khác đang chạy, cần đối chiếu quyền và môi trường. Không xóa `.backup.lock` để ép vượt khóa.

Nếu có ShellCheck, chạy `shellcheck "$HOME/linux-lab/backup.sh"`; đây là công cụ phân tích mẫu lỗi trong mã shell, giúp tìm quote thiếu và lỗi biến, nhưng không thay thử phục hồi. Lab không yêu cầu cài công cụ nếu máy chưa có.

## 7. Vì sao chạy trong terminal được nhưng chạy theo lịch lại lỗi?

**Cron** là chương trình chạy công việc theo lịch; nó có môi trường và thư mục hiện tại khác phiên tương tác. **Working directory** là thư mục mà đường dẫn tương đối được tính từ đó; `pwd` cho biết ở shell hiện tại. Script nên dùng đường dẫn tuyệt đối cho nguồn/đích, ghi stdout/stderr và mã kết thúc. `command -v tar` trong phiên bạn không đảm bảo cron có cùng PATH; thiết lập PATH chủ đích và kiểm tra bằng môi trường lịch thật.

`set -x` in dấu vết các lệnh sau expansion, hữu ích khi gỡ lỗi nhưng có thể ghi mật khẩu/token vào log. Không bật quanh bí mật. Khi bật ở lab, xem dòng đầu vào đã được tách thế nào; tắt lại bằng `set +x`. **Log** là bản ghi sự kiện giúp truy lại việc đã xảy ra; chỉ có dòng “started” chưa chứng minh công việc hoàn tất, cần status và kiểm tra sản phẩm.

Các lỗi dễ gặp và cách đọc:

| Dấu hiệu | Cách suy luận và kiểm tra |
|---|---|
| Tên có khoảng trắng làm nhiều lỗi “No such file” | Xem quote ở nơi truyền argument, thử `printf '<%s>\n' ...` |
| `unbound variable` | `set -u` gặp biến chưa gán; kiểm tra số argument trước dùng `$2` |
| `tar: file changed as we read it` | Có ghi đồng thời; dừng writer hoặc dùng cơ chế snapshot/application backup phù hợp |
| Có archive nhưng phục hồi thiếu quyền/thuộc tính | Xem option tar và tài khoản phục hồi; diff nội dung chưa bao phủ metadata |
| `.archive.*` còn sau sự cố | Trap không chạy trong mọi tình huống; kiểm tra không còn bản đang chạy trước xử lý file tạm |
| Đích đầy hoặc không ghi được | Đọc stderr và status, dùng `df -h` cho dung lượng và `ls -ld` cho quyền |

**Snapshot** là ảnh trạng thái của một lớp lưu trữ tại một thời điểm. Nó có thể giúp ổn định dữ liệu đầu vào, nhưng ảnh lưu trữ vẫn chưa chắc là trạng thái ứng dụng nhất quán nếu ứng dụng chưa hoàn tất giao dịch. Script chưa có chính sách giữ/xóa bản cũ, sao chép sang máy khác, mã hóa, bản kê kiểm tra toàn vẹn hay quy trình khôi phục database. Đặt nhiều archive cùng ổ nguồn không bảo vệ trước hỏng cả ổ. Các giới hạn đó thuộc thiết kế backup ở bài sau, không được che bằng dòng “success”.

## 8. Tự kiểm tra: áp dụng vào tình huống mới

1. Đầu vào là `my project` và `backup files`. Vì sao script vẫn nhận hai argument? **Tiêu chí:** chỉ rõ nháy ở câu gọi lẫn bên trong script, phân biệt số argument với số từ nhìn thấy.
2. `tar` thất bại nhưng một `printf` sau đó thành công. Nếu chỉ đọc `$?` cuối cùng, bạn kết luận gì sai? **Tiêu chí:** mã gần nhất là của printf; cần kiểm tra tar trước đi tiếp.
3. Bạn thấy mã `3`. Có chắc một backup khác đang chạy không? **Tiêu chí:** không; kiểm tra quyền và hỗ trợ flock, ngoài khả năng tranh khóa.
4. `tar -t` thành công nhưng ứng dụng không dùng được bản phục hồi. Điều gì chưa được chứng minh? **Tiêu chí:** dữ liệu ứng dụng nhất quán, metadata cần thiết và quy trình phục hồi.
5. SIGKILL đến trong khi ghi file tạm: phải thấy tên chính thức mới không? **Tiêu chí:** chưa đổi tên thì không; file tạm có thể còn, trap không chạy. Không khẳng định durable sau mất điện chỉ nhờ rename.
6. Biến một lệnh thành hàm dùng ở điều kiện `if`. Vì sao phải xem lại kỳ vọng `set -e`? **Tiêu chí:** ngoại lệ theo ngữ cảnh có thể áp dụng cả bên trong hàm; dùng kiểm tra lỗi rõ ràng.

Bạn đạt bài khi bản phục hồi lab trùng nội dung, các lỗi đầu vào và khóa trả mã dự kiến, giải thích được từng nhánh và nêu giới hạn. Không cần xóa dữ liệu nguồn để “thử disaster”.

Mô hình cần tự nhắc: shell diễn giải → truyền argument nguyên vẹn → kiểm tra từng thao tác → giữ file dở ở tên tạm → công bố khi hợp lệ → phục hồi để xác nhận. Bài 14 sẽ dùng cùng thói quen này để đọc từng giai đoạn máy khởi động thay vì sửa theo phỏng đoán.

## Nguồn và cách đối chiếu trên máy

- [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html): expansion, arrays, functions, trap, pipeline; đọc thêm `help trap`, `help set`, `help local` trên bản cài thực tế.
- [GNU tar manual](https://www.gnu.org/software/tar/manual/tar.html): create, list, extract và những giới hạn của backup. Đối chiếu `tar --version`/`tar --help` vì BusyBox tar có thể khác.
- [GNU coreutils: mktemp](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html): tạo file/thư mục tạm; `man mktemp`, `man realpath`, `man mv` của máy là mốc option thực tế.
- [ShellCheck documentation](https://www.shellcheck.net/): phân tích lỗi shell phổ biến.

Các đầu ra trong bài là minh họa/tiêu chí quan sát, không phải kết quả cố định cho máy của bạn.
