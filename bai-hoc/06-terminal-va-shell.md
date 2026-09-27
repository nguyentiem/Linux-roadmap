# Bài 06 — Terminal, shell và cách tự tra cứu

[Mục lục](../README.md) · [← Bài 05](05-cai-dat-va-lab.md) · [Bài 07 →](07-thu-muc-va-file.md)

## Mục tiêu

Sau bài này, bạn có thể phân biệt terminal, shell và chương trình được chạy; giải thích vì sao cùng một dòng lệnh có thể tạo số argument khác nhau; xác định một tên lệnh là alias, function, builtin hay file thực thi; và tự tìm đúng tài liệu trước khi dùng lệnh lạ. Lab dùng VM Linux từ bài 05, một terminal tương tác và **Bash**. Các quy tắc expansion bên dưới mô tả Bash; `sh`, Zsh, Fish hoặc shell rút gọn trên thiết bị nhúng có thể khác.

## 1. Khi gõ lệnh, ai làm việc gì?

**Terminal** là chương trình hoặc cửa sổ giúp bạn nhập ký tự và xem đầu ra. **Shell** là chương trình đọc dòng lệnh, diễn giải cú pháp rồi chạy việc cần làm. **Lệnh** có thể là chức năng nằm sẵn trong shell (*builtin*) hoặc một chương trình riêng (*executable*). **Argument** là từng giá trị shell chuyển cho lệnh; **option** thường là argument bắt đầu bằng `-` mà chính lệnh quyết định cách hiểu. **Prompt** là dấu nhắc chờ nhập; không gõ ký hiệu prompt khi chép ví dụ.

Giả sử bạn muốn xem thư mục `/etc`:

```text
Bàn phím → terminal/TTY → Bash → phân tích `ls -l /etc`
                                  ↓
                           chạy chương trình ls
                                  ↓
                    ls yêu cầu kernel đọc thư mục
                                  ↓
                         kết quả → terminal
```

Đọc sơ đồ từ trái sang phải rồi theo mũi tên xuống: terminal chuyển ký tự, Bash tách và xử lý dòng lệnh, `ls` hiểu `-l` và `/etc`, kernel cung cấp quyền truy cập file, terminal hiển thị kết quả. Terminal không quyết định ý nghĩa `-l`; Bash cũng không biết mọi option của `ls`. Trong ví dụ này, `ls` là tên lệnh, `-l` là option của `ls`, `/etc` là đối số đường dẫn. Lệnh khác có thể dùng cùng `-l` với nghĩa khác. Đây là mô hình khái niệm; quá trình thật còn gồm terminal giả lập, thư viện và system call. Xem [Bash: Simple Commands](https://www.gnu.org/software/bash/manual/html_node/Simple-Commands.html) và [Command Search and Execution](https://www.gnu.org/software/bash/manual/html_node/Command-Search-and-Execution.html).

Nếu dùng SSH tương tác, terminal vẫn nằm trên máy bạn, còn shell và lệnh thường chạy trên máy từ xa. SSH có thể cấp một pseudo-terminal ở đầu xa. Nếu chỉ gửi một lệnh qua SSH thì phiên có thể không có terminal tương tác. Vì thế phải xác định mình đang ở máy nào trước khi sửa file; có thể xem `hostname` và `pwd`. Xem [OpenSSH ssh(1)](https://man7.org/linux/man-pages/man1/ssh.1.html).

## 2. Bash biến dòng nhập thành lệnh như thế nào?

Bash trước hết nhận diện từ, toán tử và dấu quote. Sau đó nó thực hiện các phép **expansion** (thay thế/mở rộng), như thay `$name` bằng giá trị biến và mở rộng `*` thành tên file. Một kết quả không được quote có thể tiếp tục bị **word splitting** (tách thành nhiều từ) và **filename expansion** (khớp tên file). Cuối cùng Bash bỏ dấu quote dùng để điều khiển cú pháp, xác định tên lệnh, argument và chuyển hướng đầu vào/đầu ra trước khi thực thi. Thứ tự chi tiết có ngoại lệ theo cấu trúc cú pháp; xem [Bash: Shell Expansions](https://www.gnu.org/software/bash/manual/html_node/Shell-Expansions.html) và [Simple Command Expansion](https://www.gnu.org/software/bash/manual/html_node/Simple-Command-Expansion.html).

**Quoting** là cách giữ ký tự hoặc nhóm từ theo ý định:

| Cách viết trong Bash | Điều gì xảy ra? | Khi nào dùng? |
| --- | --- | --- |
| `'...'` | Giữ nguyên nội dung bên trong; `$name` không được thay. | Muốn ký tự đúng như đã gõ. |
| `"..."` | Vẫn thay biến và `$(lệnh)`, nhưng kết quả biến thường không bị tách từ hoặc khớp `*`. | Đưa giá trị biến thành một argument. |
| `\` trước ký tự | Bỏ ý nghĩa đặc biệt của ký tự kế tiếp trong ngữ cảnh phù hợp. | Viết nhanh một dấu cách hoặc ký tự đặc biệt literal. |

Bảng này nói về các trường hợp thông thường, không thay thế toàn bộ quy tắc Bash: trong double quote, `$`, dấu backtick, `\` và `!` ở shell tương tác vẫn có quy tắc riêng. Xem [Bash: Quoting](https://www.gnu.org/software/bash/manual/html_node/Quoting.html).

Dùng `printf` để nhìn rõ ranh giới từng argument; `%s` nhận một giá trị và cặp `<...>` chỉ là dấu mốc hiển thị:

```bash
name='Linux roadmap'
printf '<%s>\n' "$name"
printf '<%s>\n' $name
printf '%s\n' '$name' "$name"
```

**Đầu ra minh họa trong Bash mặc định** của hai dòng `printf` đầu:

```text
<Linux roadmap>
<Linux>
<roadmap>
```

Dòng đầu truyền một argument dữ liệu; dòng sau truyền hai vì kết quả `$name` không quote bị tách tại dấu cách. Dòng cuối in hai dòng: `$name` literal rồi `Linux roadmap`. Bạn có thể chạy nguyên khối để kiểm chứng. Nếu biến rỗng, có wildcard hoặc `IFS` đã đổi, kết quả không quote còn có thể khác. Quy tắc thực hành là dùng `"$name"` khi muốn giữ nguyên một giá trị làm một argument.

Dấu `*` cũng được Bash xử lý trước khi lệnh nhận argument. Trong thư mục có `a.txt` và `b.txt`, `printf '<%s>\n' *.txt` có thể in hai tên; `printf '<%s>\n' '*.txt'` in đúng chuỗi `*.txt`. Nếu không có file khớp, Bash mặc định giữ nguyên mẫu; tùy chọn shell như `nullglob` hoặc `failglob` thay đổi hành vi này. Đừng suy từ ví dụ rằng `*` luôn mở rộng thành file. Xem [Filename Expansion](https://www.gnu.org/software/bash/manual/html_node/Filename-Expansion.html).

Một đường dẫn bắt đầu bằng `-` có thể bị chương trình hiểu là option. Nhiều tiện ích chấp nhận `--` để báo hết option, ví dụ `ls -- -report`, nhưng phải kiểm tra tài liệu của **từng lệnh**; `--` không phải phép biến đổi do Bash áp dụng cho mọi chương trình.

## 3. Bash tìm lệnh ở đâu, và vì sao `cd` là builtin?

**Alias** là tên thay thế do shell mở rộng khi đọc lệnh; **function** là nhóm lệnh do shell định nghĩa; **builtin** chạy trong shell; **executable** là file chương trình riêng. `type -a ten` cho biết Bash nhận diện tên đó theo những cách nào, theo thứ tự tìm kiếm có liên quan. Thử:

```bash
type -a cd printf ls
command -v bash
```

Đầu ra tùy máy. `cd` thường hiện là shell builtin; `printf` có thể có cả builtin lẫn file `/usr/bin/printf`; `ls` thường là file và có thể có alias. `command -v bash` cho biết Bash sẽ tìm thấy gì theo cơ chế tra cứu hiện tại, **không** chứng minh rằng shell đang chạy là Bash. Muốn xác nhận lab đang ở Bash, kiểm tra `printf '%s\n' "$BASH_VERSION"` trong phiên hiện tại; giá trị rỗng hoặc báo chưa định nghĩa là dấu hiệu cần xem lại shell. `type` và `command -v` có hành vi gắn với shell hiện hành. Xem [Bash Builtins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html).

`cd` đổi **working directory** (thư mục làm việc hiện tại) của chính shell. Nếu nó chỉ chạy như chương trình con rồi thoát, shell cha vẫn ở thư mục cũ; `pwd` sau đó sẽ không đổi. Đây là lý do `cd` phải tác động trong shell hiện tại. Có thể kiểm chứng bằng `pwd`, `cd /tmp`, `pwd`, rồi `cd -` để quay lại. Thư mục `/tmp` có thể không phù hợp trong môi trường đặc biệt; dùng một thư mục chắc chắn tồn tại trên máy của bạn nếu cần.

**PATH** là biến chứa danh sách thư mục, ngăn cách bởi dấu `:`. Khi tên lệnh không chứa `/` và Bash không chọn function/builtin, Bash tìm file thực thi trong các thư mục đó theo thứ tự; Bash còn có bộ nhớ tra cứu (*hash*) nên không nhất thiết quét lại mỗi lần. Ví dụ nếu `/usr/bin` có trước `/opt/tools/bin`, file cùng tên trong `/usr/bin` thường được chọn trước. Kiểm tra bằng `printf '%s\n' "$PATH"` và `type -a ten-lenh`. Một file vừa tạo trong thư mục hiện tại thường cần gọi bằng `./ten-file`, vì thư mục hiện tại thường không nằm trong PATH. `./` là chỉ dẫn đường dẫn tương đối, không phải tên lệnh đặc biệt. Việc thêm `.` vào PATH có hệ quả an toàn: file cùng tên trong thư mục lạ có thể được chạy ngoài ý muốn. Xem [Bash: Command Search and Execution](https://www.gnu.org/software/bash/manual/html_node/Command-Search-and-Execution.html).

## 4. Biến shell, môi trường và tiến trình con liên hệ ra sao?

**Biến shell** là tên gắn với giá trị trong phiên shell. **Environment** là tập biến được truyền cho chương trình con khi nó bắt đầu. `export` đánh dấu biến shell để truyền đi; chương trình con nhận một bản giá trị tại thời điểm được tạo. Thay đổi trong con không tự sửa biến của cha.

```bash
course=linux
bash -c 'printf "con chua export: <%s>\n" "$course"'
export course
bash -c 'printf "con da export: <%s>\n" "$course"'
bash -c 'course=changed; printf "trong con: <%s>\n" "$course"'
printf 'trong cha: <%s>\n' "$course"
```

**Đầu ra minh họa** nếu `course` trước đó chưa được export: dòng thứ nhất có `<>`, dòng thứ hai `<linux>`, dòng thứ ba `<changed>`, dòng cuối `<linux>`. Nếu phiên shell đã có `course` được export, gán lại vẫn giữ thuộc tính export, nên dòng đầu có thể là `<linux>`. Dùng tên biến khác hoặc `export -n course` trong lab nếu cần kiểm tra lại. Dấu quote đơn quanh chương trình `bash -c` ngăn shell cha thay `$course`; shell con sẽ thay nó. Không dùng thí nghiệm này để suy ra biến nào tồn tại trong mọi tiến trình đang chạy. Xem [Bash: Environment](https://www.gnu.org/software/bash/manual/html_node/Environment.html) và [export builtin](https://www.gnu.org/software/bash/manual/html_node/Bourne-Shell-Builtins.html).

## 5. Tự tra cứu đúng tài liệu bằng cách nào?

Bắt đầu bằng câu hỏi “tên này thực sự là gì?” rồi chọn nguồn tương ứng:

| Điều cần biết | Lệnh tra cứu | Cách đọc |
| --- | --- | --- |
| Bash đang dùng alias, function, builtin hay file? | `type -a cd ls printf` | Xem từng dòng mô tả và đường dẫn; kết quả phụ thuộc phiên shell. |
| Cú pháp builtin Bash | `help cd`, `help export`, `help type` | `help` nói về builtin của Bash đang chạy. |
| Cú pháp chương trình ngoài | `man ls` | Tìm `SYNOPSIS`, `DESCRIPTION`, `OPTIONS`; xác nhận bản `ls` trên máy. |
| Tên file có nhiều loại trang | `man 5 passwd` | Số `5` chọn trang định dạng file, khác `passwd(1)` là lệnh. |
| Chưa biết tên trang | `man -k keyword` | Tìm mô tả ngắn; có thể cần cơ sở dữ liệu man được cài và cập nhật. |

`man` chia trang thành section: 1 là lệnh người dùng, 2 là system call, 3 là hàm thư viện, 5 là định dạng file, 8 là lệnh quản trị; còn có section khác. Trong trình xem `man`, gõ `/pattern` rồi Enter để tìm, `n` để tới kết quả tiếp, `q` để thoát. Các phím này thường thuộc trình phân trang `less`; cấu hình `PAGER` khác có thể đổi giao diện. Nếu `man` báo không tìm thấy trang, chưa chắc lệnh không tồn tại: gói trang hướng dẫn có thể chưa cài, hoặc hệ thống nhúng chỉ cung cấp `--help`. Xem [man(1)](https://man7.org/linux/man-pages/man1/man.1.html).

Đừng mặc định `echo` cho dữ liệu bất kỳ: việc xử lý option hoặc backslash có thể khác giữa builtin và hệ thống. `printf '%s\n' "$value"` cho định dạng rõ ràng hơn. Khi gặp lỗi, đọc đúng thông báo và dùng `type -a`, `help`, `man` hoặc `--help` của **lệnh đang chạy**, không chỉ một trang hướng dẫn tìm trên mạng.

## 6. Lab: một đường dẫn có khoảng trắng

Lab chỉ tạo thư mục trong home của bạn; `mkdir -p` có thể tạo thư mục cha và không báo lỗi nếu thư mục đã tồn tại. Không cần `sudo`. Chạy từng dòng trong **Bash** tương tác:

```bash
printf 'Bash: %s\n' "$BASH_VERSION"
lab_dir="$HOME/linux-lab/with space"
mkdir -p "$lab_dir"
cd "$lab_dir"
pwd
cd "$HOME"
cd $lab_dir
cd "$lab_dir"
pwd
```

Cách đọc: dòng đầu phải hiện một phiên bản Bash. `pwd` thứ nhất phải kết thúc bằng `/linux-lab/with space`. Sau khi quay về home, `cd $lab_dir` cố ý bỏ quote nên Bash có thể tách thành hai argument; trên Bash thường báo `cd: too many arguments`. Lỗi này là **đầu ra dự kiến để học**, không phải lỗi cần sửa hệ thống. Dòng `cd "$lab_dir"` kế tiếp khôi phục thao tác đúng, và `pwd` cuối xác nhận. Nếu `cd` không báo như dự kiến, kiểm tra `type cd`, giá trị `IFS`, nội dung `lab_dir` và shell đang dùng. Không thử lỗi quoting bằng `rm` vì hậu quả phụ thuộc dữ liệu thật.

Tiếp tục trong thư mục lab để thấy wildcard và đường dẫn bắt đầu bằng dấu gạch ngang:

```bash
printf 'a\n' > a.txt
printf 'b\n' > b.txt
printf '<%s>\n' *.txt
printf '<%s>\n' '*.txt'
printf 'note\n' > ./-report
ls -- -report
```

`>` là **redirection**: Bash mở file đầu ra trước khi chạy `printf`; file có sẵn sẽ bị ghi đè. Các file trên chỉ là file lab. Hai lệnh `printf` tiếp theo lần lượt cho thấy tên file khớp mẫu và dấu sao literal. `./-report` chỉ rõ đường dẫn khi tạo file; `ls -- -report` dùng quy ước kết thúc option của `ls`. Nếu muốn kiểm tra tác động, dùng `ls -l -- a.txt b.txt -report`. Xem [Bash: Redirections](https://www.gnu.org/software/bash/manual/html_node/Redirections.html).

Cuối lab, chạy `type -a cd printf ls`, `help cd`, `man ls` và `man 5 passwd` rồi ghi lại: loại của mỗi tên lệnh, section trang man, và trong hai ví dụ `"$lab_dir"`/`$lab_dir` có bao nhiêu argument đường dẫn. Không cần xóa thư mục để hoàn thành bài. Nếu muốn xóa, chỉ làm sau khi tự kiểm tra đúng đường dẫn và dữ liệu của mình.

## 7. Lỗi thường gặp và cách kiểm tra

- **`command not found`**: kiểm tra chính tả, `type -a ten`, `printf '%s\n' "$PATH"`; xem chương trình có được cài không. Với file local, thử đường dẫn `./ten-file` nếu file thực sự tồn tại và có quyền chạy.
- **`permission denied`**: lệnh đã được tìm thấy nhưng không chạy được hoặc không truy cập được tài nguyên. Kiểm tra `ls -l -- ten-file`, đường dẫn cha và chính sách mount; đừng mặc định cài lại gói.
- **`cd: too many arguments`**: đường dẫn có khoảng trắng bị tách; dùng `cd "$duong_dan"`. Nếu sau khi quote vẫn lỗi, kiểm tra thư mục có tồn tại bằng `ls -ld -- "$duong_dan"`.
- **`Ctrl+C` và `Ctrl+D` khác nhau**: với cấu hình terminal thông dụng, Ctrl+C khiến terminal gửi `SIGINT` cho nhóm tiến trình foreground; Ctrl+D là ký tự kết thúc đầu vào khi thích hợp, không phải tín hiệu kill. Trong shell đang chờ lệnh, Ctrl+D thường làm shell thoát; khi một chương trình đang đọc stdin, kết quả phụ thuộc chương trình. Xem [termios(3)](https://man7.org/linux/man-pages/man3/termios.3.html).
- **Kết quả trên máy khác tài liệu**: đối chiếu shell, distro, phiên bản tiện ích và alias/function trước. `type -a ls` có thể cho thấy alias, trong khi `man ls` mô tả chương trình ngoài.

## 8. Tự kiểm tra

1. Một người gõ `ls -l /etc` qua phiên SSH tương tác. Terminal, Bash và `ls` ở máy nào? **Tự đối chiếu:** terminal hiển thị ở máy cục bộ; shell và `ls` của phiên SSH chạy ở máy từ xa, trừ khi bạn đã thay đổi ngữ cảnh bằng công cụ khác.
2. `target='two words'`; `printf '<%s>\n' $target` in mấy dòng trong Bash mặc định? Sửa thành một dòng. **Tự đối chiếu:** hai dòng do tách từ; dùng `"$target"`.
3. `type -a printf` cho cả builtin và `/usr/bin/printf`. `man printf` chắc chắn mô tả cái nào? **Tự đối chiếu:** trang man thường mô tả tiện ích ngoài; dùng `help printf` để đọc builtin Bash và kiểm tra thực tế trên máy.
4. Vì sao `export course` giúp `bash -c` đọc biến nhưng thay `course` trong shell con không đổi shell cha? **Tự đối chiếu:** con nhận môi trường lúc khởi tạo; thay đổi của con không truyền ngược.
5. `man 5 passwd` và `man 1 passwd` giải đáp hai câu hỏi khác nhau thế nào? **Tự đối chiếu:** section 5 nói về định dạng file; section 1 nói về lệnh dành cho người dùng.

## Tóm tắt mô hình tư duy

Terminal chuyển nhập/xuất; Bash diễn giải cú pháp và quyết định lệnh cần chạy; lệnh nhận **argument sau expansion**, rồi tự hiểu option của nó. Quoting giữ đúng ranh giới argument. `type` xác định tên lệnh trong phiên shell, `help` tra builtin, `man` tra trang theo section. Khi kết quả lạ, kiểm tra shell, expansion, PATH và tài liệu của đúng chương trình trước khi sửa hệ thống. Bài 07 sẽ dùng mô hình này để thao tác với thư mục và file an toàn hơn.
