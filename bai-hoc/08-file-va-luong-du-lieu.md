# Bài 08 — Thao tác file, pipe và redirect

[Mục lục](../README.md) · [← Bài 07](07-thu-muc-va-file.md) · [Bài 09 →](09-xu-ly-van-ban.md)

## Mục tiêu

Sau bài 06–07, bạn đã biết nhập lệnh và tìm file. Bài này giải quyết một việc thực tế: đọc danh sách trong `input.txt`, đếm số lần xuất hiện của từng dòng, lưu báo cáo và giữ thông báo lỗi riêng để kiểm tra.

Sau bài này, bạn cần tự giải thích được:

- Dữ liệu đi vào và đi ra chương trình qua những đường nào; vì sao dữ liệu và lỗi cần tách riêng.
- Cách `>`, `>>`, `<`, `2>`, `2>&1` và `|` thay đổi đường đi ấy.
- Vì sao thứ tự redirect có thể đổi kết quả hoặc làm mất nội dung file.
- Cách ghép công cụ, đọc mã kết thúc và phát hiện lỗi trong chuỗi lệnh.
- Sự khác nhau giữa sao chép, đổi tên, chuyển sang nơi lưu khác và xóa tên file.

Phạm vi thực hành là **Linux với Bash và các công cụ GNU**. Bash là chương trình đọc và diễn giải lệnh; GNU cung cấp những công cụ như `cat`, `cp`, `sort`. Trên thiết bị nhúng, BusyBox có thể cung cấp các công cụ cùng tên nhưng ít tùy chọn hơn. Các đầu ra bên dưới được ghi là **minh họa**; hãy chạy lab để quan sát máy của bạn, không suy ra phiên bản hay ngôn ngữ thông báo từ ví dụ.

## 1. Trước khi nối lệnh, cần hiểu những thành phần nào?

### 1.1. File, byte và luồng dữ liệu có quan hệ gì?

**File (tệp)** thông thường là nơi lưu một dãy dữ liệu có tên, chẳng hạn `input.txt`. **Byte** là đơn vị dữ liệu gồm 8 bit; bit là một giá trị 0 hoặc 1. Chữ, ảnh và chương trình đều được biểu diễn bằng byte. Với văn bản tiếng Việt, một ký tự có thể cần nhiều byte, nên số byte không đồng nghĩa số ký tự.

**Luồng dữ liệu (stream)** là dữ liệu được đọc hoặc ghi theo trình tự. Khi `cat input.txt` đọc file rồi ghi ra màn hình, nó chuyển byte từ một nguồn sang một đích. `cat` là công cụ đọc các file và nối nội dung của chúng ra đầu ra; nó không cần hiểu `alpha` có nghĩa gì. Nếu không có tên file, `cat` thường đọc từ đầu vào chuẩn, được giải thích ở mục 2.

```bash
printf 'alpha\nbeta\nalpha\n' > input.txt
wc -c input.txt
wc -l input.txt
```

`printf` tạo văn bản theo mẫu; `\n` trong mẫu này tạo ký tự xuống dòng. `wc` đếm dữ liệu: `-c` đếm byte, `-l` đếm ký tự xuống dòng. **Minh họa:** file này có 17 byte và 3 ký tự xuống dòng. Một dòng cuối không kết thúc bằng xuống dòng sẽ không được `wc -l` tính thêm; công cụ này không phải phép đếm mọi “dòng nhìn thấy” trong trình soạn thảo.

### 1.2. Ai hiểu dấu `>`: chương trình hay shell?

**Shell** là bộ diễn giải lệnh: nhận câu lệnh, hiểu dấu nháy và các toán tử như `>`, chuẩn bị đầu vào/đầu ra rồi thực hiện lệnh. Bash là một loại shell. **Terminal** là giao diện nhận bàn phím và hiển thị chữ; terminal và shell là hai thành phần khác nhau. Trong phiên tương tác thông thường, terminal đưa những gì bạn gõ cho shell xử lý.

**Process (tiến trình)** là một chương trình đang được thực thi, có tài nguyên và trạng thái riêng. Chạy công cụ `cat` thường tạo một tiến trình `cat`. Một số lệnh như `printf` được Bash thực hiện ngay bên trong shell, nên không phải mỗi lệnh đều tạo tiến trình mới.

**Kernel (nhân hệ điều hành)** là phần lõi quản lý tài nguyên và thực hiện việc truy cập file, thiết bị, bộ nhớ cho chương trình. Chương trình yêu cầu kernel đọc/ghi qua **system call (lời gọi hệ thống)**, tức giao diện yêu cầu dịch vụ của kernel, ví dụ `read()` và `write()`.

Với `cat input.txt > output.txt`, Bash hiểu `>` và chuẩn bị nơi ghi; `cat` nhận tên `input.txt`, đọc nội dung rồi ghi qua đường đầu ra đã được chuẩn bị. Kernel thực hiện thao tác mở, đọc và ghi bên dưới. Kiểm tra shell hiện tại bằng `printf '%s\n' "$BASH_VERSION"`: trong Bash, biến này chứa phiên bản Bash đang chạy. Dấu `$` yêu cầu shell lấy giá trị biến; dấu nháy kép giữ giá trị thành một đối số. Biến `$SHELL` thường phản ánh shell đăng nhập được cấu hình, không đủ để kết luận shell hiện tại.

### 1.3. “File descriptor” có phải tên file không?

**File descriptor (FD, số mô tả file)** là một số nhỏ mà tiến trình dùng để tham chiếu một tài nguyên đang mở. Nó giống số hiệu của một cửa đọc/ghi: chương trình dùng số đó thay vì tra lại tên đường dẫn mỗi lần. FD có thể tham chiếu file thông thường, terminal hoặc đường truyền giữa các tiến trình; không phải mọi FD đều tương ứng một file lưu trên đĩa.

**Đường dẫn** như `./input.txt` giúp tìm file: `.` là thư mục hiện tại. Khi mở thành công, kernel cấp FD; chương trình đọc qua FD ấy. Việc đổi tên file sau đó không tự làm FD đang mở mất hiệu lực. FD chỉ có ý nghĩa trong tiến trình sở hữu nó; FD 3 của hai tiến trình không nhất thiết trỏ cùng tài nguyên. Đây là mô hình được mô tả trong [Linux man-pages: open(2)](https://man7.org/linux/man-pages/man2/open.2.html).

## 2. Vì sao một chương trình thường có ba đường dữ liệu chuẩn?

**Đầu vào chuẩn (stdin)** là nguồn chương trình có thể đọc khi không dùng một nguồn riêng. **Đầu ra chuẩn (stdout)** là nơi chương trình ghi kết quả. **Đầu ra lỗi chuẩn (stderr)** là nơi ghi thông báo chẩn đoán, cảnh báo hoặc lỗi. Theo quy ước, chúng dùng FD 0, 1 và 2.

Bảng sau mô tả một phiên chạy lệnh tương tác thông thường, trước khi đổi hướng:

| FD | Tên | Vai trò | Đích/nguồn thường gặp |
|---|---|---|---|
| 0 | stdin | Đọc dữ liệu đầu vào | Terminal, thường nhận dữ liệu bạn gõ |
| 1 | stdout | Ghi kết quả để người hoặc công cụ khác dùng | Terminal |
| 2 | stderr | Ghi chẩn đoán để kiểm tra quá trình chạy | Terminal |

Hai đầu ra cùng hiện trên màn hình nên dễ bị tưởng là một. Tách chúng giúp báo cáo chỉ chứa dữ liệu, còn lỗi đi vào file riêng. Đây là quy ước của công cụ: chương trình vẫn có thể ghi thông báo sai kênh hoặc tự mở file riêng. Không phải mọi chương trình đều đọc stdin hay dùng đủ ba FD.

Để quan sát trên Linux:

```bash
ls -l /proc/$$/fd/0 /proc/$$/fd/1 /proc/$$/fd/2
```

`$$` là mã số tiến trình của Bash; `/proc` là cây thông tin do kernel cung cấp về hệ thống đang chạy. `ls -l` hiển thị chi tiết, trong đó mũi tên cho thấy tài nguyên được tham chiếu. Nếu hiện `/dev/pts/...`, đó thường là terminal giả lập; `pipe:[...]` biểu thị pipe. Bạn đang xem FD của shell, không phải của mọi chương trình. `/proc` có thể bị hạn chế trong một số môi trường; cách xem này không phải yêu cầu để làm các lab cơ bản.

## 3. Redirect thay đổi nguồn hoặc đích như thế nào?

**Redirect (chuyển hướng)** là thao tác shell đổi nguồn đọc hoặc đích ghi của một FD. Ví dụ `cat < input.txt > output.txt` nối stdin với file nguồn và stdout với file đích. Nó không “chuyển file vào chương trình” theo nghĩa gửi tên file; nó mở tài nguyên rồi thiết lập đường đọc/ghi.

Bảng là bản đồ nhanh; phần sau sẽ giải thích từng cơ chế:

| Cú pháp | Điều xảy ra |
|---|---|
| `cmd < input.txt` | FD 0 đọc từ file |
| `cmd > out.txt` | FD 1 ghi vào file; tạo mới hoặc làm rỗng file có sẵn |
| `cmd >> out.txt` | FD 1 ghi nối vào cuối file; tạo file nếu chưa có |
| `cmd 2> err.txt` | FD 2 ghi vào file lỗi, tạo mới hoặc làm rỗng |
| `cmd 2>> err.txt` | FD 2 ghi nối vào file lỗi |
| `cmd > all.txt 2>&1` | FD 1 vào file, rồi FD 2 dùng cùng đích với FD 1 |

`cmd` là tên thay thế cho một lệnh cụ thể. Không gõ nguyên chữ đó khi thực hành. Trong `2>`, số 2 phải sát dấu `>`; `cmd 2 > out.txt` thường đưa chuỗi `2` thành đối số của lệnh rồi chuyển stdout.

### 3.1. Vì sao `>` có thể làm mất dữ liệu trước khi chương trình chạy?

**Truncate** là cắt ngắn file; với `>` trên file thông thường đã có, shell thường đưa kích thước về 0 trước khi thực hiện lệnh. **Append** là ghi nối vào cuối, cách `>>` hoạt động.

Với `cat input.txt > output.txt`, trình tự khái niệm là:

1. Bash phân tích lệnh và xác định cần đổi FD 1.
2. Bash yêu cầu mở `output.txt` để ghi: nếu chưa có thì tạo, nếu đã có thì làm rỗng theo chế độ mặc định.
3. Bash thiết lập stdout của lệnh để ghi vào tài nguyên ấy.
4. `cat` đọc `input.txt`, ghi byte ra stdout; kernel đưa byte vào `output.txt`.

Vì bước 2 xảy ra trước bước 4, **không dùng `sort input.txt > input.txt`**. `sort` là công cụ sắp xếp các dòng văn bản; lúc nó đọc nguồn thì nguồn đã có thể bị làm rỗng. Cùng một file được truy cập qua hai tên khác nhau cũng có thể gây vấn đề tương tự.

Nếu không mở được file đích, chẳng hạn thư mục cha không tồn tại, chuyển hướng thất bại và lệnh đó không được thực hiện. Tuy nhiên các chuyển hướng trước đó trong cùng câu lệnh có thể đã tạo hoặc làm rỗng file: thất bại không có nghĩa mọi tác động trước đó được hoàn tác. Cơ chế và thứ tự xử lý được quy định trong [Bash: Redirections](https://www.gnu.org/software/bash/manual/html_node/Redirections.html).

### 3.2. `< input.txt` khác `input.txt` ở điểm nào?

```bash
cat input.txt
cat < input.txt
wc -l input.txt
wc -l < input.txt
```

Hai lệnh `cat` cho cùng nội dung trong ví dụ này, nhưng khác trách nhiệm: lệnh thứ nhất để `cat` mở file theo đối số; lệnh thứ hai để shell mở file làm stdin và `cat` đọc stdin. **Minh họa:** `wc -l input.txt` in `3 input.txt`, còn `wc -l < input.txt` thường chỉ in `3`, có thể kèm khoảng trắng căn lề. `wc` không nhận đối số tên file trong trường hợp thứ hai.

Giới hạn: `<` không buộc một chương trình đọc stdin nếu chương trình ấy không sử dụng nó. Nếu chạy `cat` không có đối số và không chuyển hướng trong terminal, nó chờ bạn nhập. Với chế độ terminal thông thường, `Ctrl+D` ở đầu dòng báo hết dữ liệu nhập; đây không phải một dòng chữ được thêm vào file.

### 3.3. Tại sao thứ tự `2>&1` quan trọng?

`2>&1` nghĩa là **cho FD 2 tham chiếu đích hiện tại của FD 1**, không phải tạo file tên `1`, cũng không phải làm FD 2 luôn chạy theo mọi thay đổi tương lai của FD 1.

Giả sử stdout ban đầu đang đi ra terminal:

```text
> all.txt 2>&1                 2>&1 > out.txt

1. FD 1 -> all.txt             1. FD 2 -> terminal (đích cũ của FD 1)
2. FD 2 -> cùng đích FD 1      2. FD 1 -> out.txt

Kết quả: cả hai vào file       Kết quả: chỉ stdout vào file
```

Đọc mỗi cột từ trên xuống: shell áp dụng từng chuyển hướng từ trái sang phải. Bạn có thể kiểm tra bằng nhóm lệnh `{ ...; }`, cách gom nhiều lệnh để áp dụng một chuyển hướng chung; cần khoảng trắng sau `{` và dấu `;` trước `}`:

```bash
{ printf 'DATA\n'; printf 'ERROR\n' >&2; } > all.txt 2>&1
{ printf 'DATA\n'; printf 'ERROR\n' >&2; } 2>&1 > out.txt
cat all.txt
cat out.txt
```

`>&2` cho stdout của riêng lệnh `printf` đó dùng đích stderr, để chủ động tạo một thông báo trên kênh lỗi. **Minh họa:** dòng `ERROR` của nhóm thứ hai hiện ở terminal; `all.txt` có cả hai dòng, `out.txt` chỉ có `DATA`. Giả định stdout ban đầu là terminal; nếu shell đang được chạy trong một chuỗi lệnh khác, “đích cũ” có thể là pipe hoặc file.

Gộp hai luồng hữu ích khi giữ nhật ký chung, nhưng mất khả năng phân biệt kênh của từng byte. Với nhiều tiến trình hoặc cơ chế giữ dữ liệu tạm trước khi ghi, thứ tự dòng trong nhật ký cũng không nhất thiết phản ánh chính xác thứ tự sự kiện thực tế.

## 4. Pipe giúp các công cụ phối hợp ra sao?

**Pipe (ống dẫn)** là kênh do kernel quản lý để tiến trình ghi dữ liệu và tiến trình khác đọc dữ liệu. **Pipeline** là chuỗi lệnh nối bằng `|`. Với `a | b`, shell nối stdout của `a` vào stdin của `b`; stderr của `a` vẫn đi theo đích riêng. Pipe vận chuyển byte, không tự biết dòng nào là tên người, lỗi hay bản ghi.

Tình huống xuyên suốt của bài dùng:

```bash
sort input.txt | uniq -c | tee counts.txt
```

`uniq` gộp những dòng **giống nhau nằm liền nhau**; `-c` thêm số lần lặp. Vì hai dòng `alpha` ban đầu không liền nhau, cần `sort` đưa chúng cạnh nhau. `tee` đọc stdin, ghi cùng dữ liệu ra stdout và vào file được chỉ định, giúp vừa xem vừa lưu; mặc định nó làm rỗng file đích có sẵn, `tee -a` ghi nối.

```text
input.txt -> sort -> pipe -> uniq -c -> pipe -> tee -> stdout (terminal)
                                                    |
                                                    +-> counts.txt

stderr của từng công cụ ---------------------------> terminal (mặc định)
```

Đọc mũi tên từ trái sang phải: `sort` đọc file, pipe thứ nhất mang các dòng đã sắp xếp, `uniq` đếm từng nhóm, pipe thứ hai mang báo cáo, `tee` nhân dữ liệu sang hai đích. Mũi tên stderr riêng cho thấy lỗi không tự trở thành dữ liệu đầu vào của công cụ kế tiếp.

**Minh họa**, khoảng trắng căn lề có thể khác:

```text
      2 alpha
      1 beta
```

Tự kiểm tra bằng `cat counts.txt` và so sánh với dữ liệu nguồn. `uniq -c input.txt` sẽ cho ba nhóm có số đếm 1 vì nó không tìm mọi bản sao ở bất kỳ vị trí nào. Thứ tự sắp xếp còn phụ thuộc **locale**, tức thiết lập ngôn ngữ và quy tắc so sánh ký tự; dùng `LC_ALL=C sort input.txt` khi cần quy tắc so sánh của môi trường C ổn định cho ví dụ. `LC_ALL=C` trước lệnh chỉ đặt môi trường cho lệnh ấy.

### 4.1. Có phải lệnh đầu chạy xong thì lệnh sau mới chạy?

Các thành phần thường chạy đồng thời và trao đổi dữ liệu khi có thể. **Buffer (bộ đệm)** là vùng giữ dữ liệu tạm; pipe có dung lượng hữu hạn. Nếu bên đọc chậm và pipe đầy, bên ghi có thể phải chờ. Một công cụ cũng có thể giữ dữ liệu trong bộ đệm riêng. Chẳng hạn `sort` thường cần đọc hết đầu vào để xác định thứ tự trước khi xuất toàn bộ kết quả. Vì vậy có pipe không đồng nghĩa kết quả luôn xuất ngay lập tức.

**EOF (end of file, hết dữ liệu)** là trạng thái bên đọc nhận được khi không còn byte và mọi đầu ghi pipe đã đóng; nó không phải ký tự đặc biệt chèn vào stream. Nếu một tiến trình còn giữ đầu ghi mở, bên đọc có thể tiếp tục chờ. Đây là một nguyên nhân pipeline có vẻ “treo”. Các quy tắc bộ đệm, EOF và đầu đọc/ghi được mô tả trong [Linux man-pages: pipe(7)](https://man7.org/linux/man-pages/man7/pipe.7.html).

### 4.2. Nếu vừa dùng pipe vừa redirect thì sao?

```bash
printf 'alpha\n' > diverted.txt | wc -l
```

Shell thiết lập pipe trước, rồi chuyển hướng riêng của lệnh có thể thay đích stdout. Trong ví dụ, stdout của `printf` đi vào `diverted.txt`, nên `wc` đọc pipe không có dữ liệu và đếm 0. Tự kiểm tra bằng `cat diverted.txt`: dòng `alpha` nằm ở đó.

Muốn đưa cả lỗi vào pipe, có thể dùng `a 2>&1 | b`; Bash còn có cú pháp `a |& b`. Chỉ gộp khi công cụ sau thực sự phải xử lý cả chẩn đoán, nếu không các dòng lỗi sẽ làm sai báo cáo. `|&` là cú pháp Bash, không nên mặc định mọi shell trên thiết bị nhúng đều hỗ trợ. Xem [Bash: Pipelines](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html).

## 5. Có dữ liệu đầu ra rồi, vì sao vẫn phải kiểm tra kết thúc?

**Exit status (trạng thái kết thúc, thường gọi exit code)** là số mà shell nhận sau khi lệnh hoàn tất: 0 thường là thành công, khác 0 báo một trạng thái khác theo quy ước công cụ. Nó tách biệt với văn bản trên stdout/stderr. Một chương trình có thể xuất một phần dữ liệu rồi thất bại; một công cụ có thể trả khác 0 để báo không tìm thấy dữ liệu dù không có lỗi hệ thống.

`$?` chứa trạng thái của lệnh hoặc pipeline vừa chạy. Phải lưu ngay vì lệnh tiếp theo thay giá trị này:

```bash
cat input.txt missing.txt > output.txt 2> error.txt
result=$?
printf 'exit=%s\n' "$result"
```

`result=$?` tạo biến giữ kết quả, không có khoảng trắng quanh `=`. `%s` yêu cầu `printf` chèn giá trị chuỗi ở đối số sau. **Minh họa:** `cat` đọc được file thứ nhất, ghi ba dòng vào `output.txt`, nhưng không mở được `missing.txt`, ghi lỗi vào `error.txt` và trả khác 0. Như vậy file kết quả không rỗng vẫn chưa chứng minh mọi nguồn đã được xử lý.

### 5.1. Trạng thái pipeline đại diện cho lệnh nào?

Trong Bash, mặc định trạng thái pipeline là của lệnh cuối. `false` là lệnh cố ý trả thất bại, `true` cố ý trả thành công:

```bash
( set +o pipefail; false | true; printf 'default=%s\n' "$?" )
( set -o pipefail; false | true; printf 'pipefail=%s\n' "$?" )
```

**Subshell** là môi trường shell con dùng để chạy nhóm lệnh trong `(...)`; đổi tùy chọn bên trong không đổi shell làm việc bên ngoài. `set +o pipefail` tắt và `set -o pipefail` bật tùy chọn kiểm tra lỗi pipeline. **Minh họa:** dòng đầu là `default=0`, dòng sau là `pipefail=1`.

Khi bật `pipefail`, Bash trả trạng thái khác 0 của **lệnh ngoài cùng bên phải có trạng thái khác 0**; nếu tất cả thành công thì trả 0. Đây không phải tổng lỗi hay luôn là lỗi xảy ra đầu tiên. Để xem từng thành phần, Bash cung cấp mảng `PIPESTATUS`, tức danh sách trạng thái theo thứ tự lệnh:

```bash
false | true
statuses=( "${PIPESTATUS[@]}" )
printf 'left=%s right=%s\n' "${statuses[0]}" "${statuses[1]}"
```

`${PIPESTATUS[@]}` lấy mọi phần tử; chỉ số bắt đầu từ 0. Phải sao chép ngay: kể cả một lệnh gán biến khác cũng làm mất danh sách trước đó. **Minh họa:** `left=1 right=0`. `PIPESTATUS` là đặc tính Bash, không mặc định có trong `/bin/sh`.

### 5.2. `pipefail` báo lỗi có luôn nghĩa là dữ liệu cần dùng bị sai?

**Signal (tín hiệu)** là thông báo mà hệ điều hành gửi cho tiến trình để báo sự kiện hoặc yêu cầu thay đổi hoạt động. **SIGPIPE** là tín hiệu thường phát sinh khi chương trình ghi vào pipe không còn đầu đọc. Ví dụ `head -n 1` là công cụ chỉ đọc/in một dòng đầu rồi kết thúc:

```bash
( set -o pipefail; yes alpha | head -n 1; printf 'status=%s\n' "$?" )
```

`yes alpha` liên tục sinh dòng `alpha`. `head` lấy đủ một dòng và đóng đầu đọc; bên ghi có thể nhận SIGPIPE. Trên Linux/Bash thông thường, trạng thái minh họa là 141, tương ứng cách Bash báo 128 cộng số tín hiệu 13. Không dùng con số này làm quy tắc cho mọi hệ điều hành hay mọi chương trình: chương trình có thể xử lý tín hiệu theo cách khác.

Trường hợp này công cụ cuối đã lấy đúng dữ liệu mong muốn. Cần xét mục đích pipeline và trạng thái từng lệnh thay vì coi mọi trạng thái khác 0 là cùng một lỗi. Ngược lại, trong pipeline tạo báo cáo đầy đủ, lỗi đọc nguồn hoặc ghi file cần được xử lý trước khi chấp nhận báo cáo. `pipefail` giúp phát hiện, không tự hoàn tác file đã ghi hoặc tự sửa lỗi.

## 6. Sao chép, đổi tên và xóa: điều gì thay đổi bên dưới?

### 6.1. Vì sao phải phân biệt tên file với dữ liệu file?

**Filesystem (hệ thống tệp)** là cách hệ điều hành tổ chức và quản lý file, thư mục và vùng lưu dữ liệu, chẳng hạn ext4. Thư mục chứa các mục liên kết tên với đối tượng file. **Inode** là cấu trúc ghi thông tin quản lý một đối tượng file trên các filesystem kiểu Unix: loại file, kích thước, quyền, chủ sở hữu và thông tin dẫn tới dữ liệu; tên nằm trong mục thư mục, không phải là chính inode.

**Metadata (dữ liệu mô tả)** là thông tin về file, khác với nội dung file: ví dụ kích thước, thời gian sửa, chủ sở hữu. **Permission (quyền truy cập)** quy định ai được đọc, ghi hoặc thực thi. File văn bản cần quyền đọc để `cat` đọc; tạo file cần quyền phù hợp trên thư mục chứa nó. `ls -l input.txt` cho thấy quyền và chủ sở hữu, `stat input.txt` cho thấy thêm kích thước, inode và số liên kết. Các lệnh này mô tả trạng thái tại thời điểm chạy, không chứng minh mọi thao tác trong tương lai sẽ được cho phép.

**Hard link (liên kết cứng)** là thêm một tên cùng tham chiếu một inode. Hai tên ấy không phải hai bản sao độc lập. Với một file mới, mô hình đơn giản là:

```text
Thư mục: input.txt -----> inode -----> nội dung alpha/beta/alpha
Tiến trình: FD đang mở -> tham chiếu mở tới đối tượng file ấy
```

Mũi tên tên file là đường tìm kiếm từ thư mục; mũi tên FD là đường tiếp tục truy cập sau khi đã mở. Bởi vậy thay tên và đóng FD là hai thao tác khác nhau. Số inode chỉ cần so sánh trong cùng filesystem; cùng số trên hai filesystem không chứng minh cùng file.

### 6.2. `cp` tạo bản sao như thế nào, giữ lại gì?

```bash
cp -- input.txt copied.txt
printf 'gamma\n' >> copied.txt
cat input.txt
cat copied.txt
```

`cp` sao chép; `--` kết thúc phần tùy chọn để tên bắt đầu bằng `-` không bị hiểu là tùy chọn. Khi đích chưa tồn tại, ví dụ này tạo một file riêng; sửa bản sao không đổi nội dung nguồn. Tự kiểm tra: nguồn vẫn ba dòng, bản sao có thêm `gamma`. Nếu đích đã là thư mục, `cp input.txt thư-mục` thường tạo file cùng tên bên trong; luôn xác định rõ đích trước khi chạy.

`cp -a -- thu-muc-nguon thu-muc-dich` dùng chế độ lưu trữ của GNU: sao chép cả cây thư mục và cố giữ nhiều metadata, cùng quan hệ liên kết. **Symbolic link (liên kết tượng trưng)** là đối tượng chứa đường dẫn tới một tên khác; khác hard link, nó có thể trỏ tới tên không tồn tại. `cp -a` thường sao chép liên kết tượng trưng dưới dạng liên kết thay vì lấy nội dung đích.

Nhưng “cố giữ” có giới hạn: người dùng thường không được đặt chủ sở hữu tùy ý; filesystem đích có thể không biểu diễn được mọi thuộc tính. GNU `cp -a` còn có thể bỏ qua một số thất bại giữ thuộc tính mở rộng mà không báo lỗi tương ứng. **Thuộc tính mở rộng** là các cặp tên/giá trị bổ sung gắn với file, có thể chứa thông tin bảo mật. Khi chúng quan trọng, cần kiểm tra riêng bằng công cụ phù hợp và đọc tài liệu môi trường. Không coi trạng thái 0 là chứng minh mọi metadata giống hoàn toàn.

Đọc chi tiết trong [GNU Coreutils: cp](https://www.gnu.org/software/coreutils/manual/html_node/cp-invocation.html). Bản sao trên cùng ổ không bảo vệ khỏi hỏng ổ; nguồn đang bị chương trình khác sửa cũng có thể tạo bản sao không nhất quán. Backup là quy trình giữ bản phục hồi, có lịch sử và kiểm tra khôi phục, không chỉ một lần chạy `cp -a`.

### 6.3. `mv` có luôn sao chép toàn bộ dữ liệu không?

```bash
stat -c 'device=%d inode=%i name=%n' copied.txt
mv -- copied.txt renamed.txt
stat -c 'device=%d inode=%i name=%n' renamed.txt
```

`mv` chuyển hoặc đổi tên. `stat -c` của GNU in các trường đã chọn: `%d` là số nhận diện thiết bị/filesystem, `%i` là số inode, `%n` là tên. Với file thông thường trên filesystem cục bộ trong cùng thư mục lab, bạn thường thấy device và inode giữ nguyên, tên đổi. Đây là dấu hiệu đổi mục thư mục thay vì tạo bản sao nội dung mới.

Đổi tên thường dùng thao tác kernel `rename()`. Khi thay một tên đích có sẵn thành công, việc thay tên có tính **atomic (nguyên tử)**: tiến trình khác mở tên đích không thấy một giai đoạn tên đích bị bỏ trống giữa hai trạng thái. Điều này không biến cả một chuỗi nhiều lệnh thành một giao dịch duy nhất, và tiến trình đã mở bản cũ vẫn có thể đọc bản cũ.

Khi đích thuộc filesystem khác, GNU `mv` thường phải sao chép rồi xóa nguồn sau khi sao chép thành công, nên thời gian và khả năng thất bại khác hẳn. Hai thư mục khác tên chưa đủ chứng minh khác filesystem; ngược lại, đích nằm dưới cùng cây `/` vẫn có thể thuộc nơi lưu khác.

**Mount (gắn hệ thống tệp)** là đưa nội dung một filesystem vào cây thư mục tại **mount point (điểm gắn)**, tức thư mục làm vị trí truy cập, ví dụ filesystem USB xuất hiện dưới `/media/usb`. Đó là lý do cây thư mục có thể nối nhiều filesystem. Nếu có công cụ `findmnt`, dùng `findmnt -T .` để xem filesystem chứa thư mục hiện tại; đây là đọc thông tin, không thực hiện mount. Trong môi trường có lớp lưu trữ đặc biệt, cơ chế có thể phức tạp hơn ví dụ file cục bộ.

Tham khảo [GNU Coreutils: mv](https://www.gnu.org/software/coreutils/manual/html_node/mv-invocation.html) và [Linux man-pages: rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html).

### 6.4. Đổi tên nguyên tử có bảo đảm chịu được mất điện không?

Không. **Durability (độ bền của dữ liệu)** là khả năng thay đổi vẫn tồn tại sau sự cố hoặc mất điện; khác với atomic là cách thay đổi được nhìn thấy khi hệ thống đang chạy. Dữ liệu có thể còn ở bộ nhớ đệm, chưa được thiết bị lưu bền vững.

Ứng dụng cần cập nhật bền vững thường phải ghi file mới, yêu cầu đồng bộ bằng `fsync()`, đổi tên, rồi đồng bộ thư mục chứa tên, đồng thời kiểm tra lỗi ở từng bước. `fsync()` là lời gọi yêu cầu đưa các thay đổi của một đối tượng mở xuống nơi lưu trữ; đồng bộ file không tự bảo đảm mục tên trong thư mục đã xuống đĩa. Bài này chỉ dùng mẫu file tạm để tránh làm rỗng nguồn, không tuyên bố mẫu đó chịu được mất điện. Xem [Linux man-pages: fsync(2)](https://man7.org/linux/man-pages/man2/fsync.2.html).

### 6.5. Vì sao `rm` rồi mà dữ liệu còn có thể được đọc?

`rm` gỡ tên file khỏi thư mục. Khi đó không mở lại được qua tên vừa xóa. Nhưng nếu còn hard link khác hoặc còn tham chiếu đang mở, đối tượng vẫn có thể tồn tại. Với mô hình file thông thường, khi tên cuối và tham chiếu mở cuối được giải phóng, vùng lưu có thể được tái sử dụng. Xem [Linux man-pages: unlink(2)](https://man7.org/linux/man-pages/man2/unlink.2.html).

Điều này giải thích một phần vì sao `df` và `du` có thể lệch: `df` báo sử dụng dung lượng ở mức filesystem, `du` tính dung lượng theo các file tìm được qua cây thư mục. File không còn tên nhưng vẫn mở có thể chiếm dung lượng mà `du` không thấy. Hai công cụ còn có nguyên nhân chênh lệch khác; sẽ học kỹ ở bài 39.

`rm` không chuyển file vào thùng rác của giao diện đồ họa, cũng không bảo đảm ghi đè byte để xóa an toàn khỏi thiết bị. Quyền xóa thường phụ thuộc thư mục chứa tên, không đơn giản là file có cho ghi nội dung hay không. Khi gặp lỗi, kiểm tra quyền thư mục và các cơ chế bảo vệ khác; không vội thêm `sudo`.

## 7. Lab: tạo báo cáo, kiểm tra lỗi và thay file đúng trình tự

### 7.1. Chuẩn bị môi trường riêng

Chạy các bước trong cùng một phiên Bash tương tác thông thường, không bật `set -e` (tùy chọn có thể làm shell kết thúc ở một số lệnh thất bại). Lab cố ý tạo lỗi để quan sát. Không cần quyền quản trị; tất cả file thay đổi nằm trong thư mục lab mới.

```bash
printf 'Bash=%s\n' "$BASH_VERSION"
command -v cat sort uniq tee wc cp mv rm stat mktemp
mkdir -p "$HOME/linux-lab/streams"
lab_dir=$(mktemp -d "$HOME/linux-lab/streams/run.XXXXXX")
cd "$lab_dir"
pwd
printf 'alpha\nbeta\nalpha\n' > input.txt
```

`command -v` tìm lệnh mà shell sẽ dùng, giúp biết công cụ có sẵn; không chứng minh phiên bản GNU hoặc mọi tùy chọn được hỗ trợ. Có thể kiểm tra bằng `bash --version`, `cp --version`, `stat --version`. Nếu không phải GNU, tra trợ giúp công cụ trước khi dùng các tùy chọn GNU trong bài.

`mkdir -p` tạo cả các thư mục cha còn thiếu. `$HOME` là thư mục cá nhân; bài chỉ đọc biến này, không đổi giá trị. `mktemp -d` tạo thư mục riêng với phần `XXXXXX` được thay bằng chuỗi duy nhất. `$(...)` lấy đầu ra lệnh làm giá trị biến `lab_dir`. Chỉ tiếp tục khi `mktemp` và `cd` thành công; `pwd` phải hiện đường dẫn có phần `linux-lab/streams/run.…`. Thư mục mới tránh trùng `missing.txt` và tránh ghi đè kết quả cũ.

### 7.2. Tách kết quả khỏi lỗi và lưu status ngay

```bash
cat input.txt missing.txt > output.txt 2> error.txt
result=$?
printf 'exit=%s\n' "$result"
cat output.txt
cat error.txt
wc -l input.txt output.txt
```

Đọc kết quả theo thứ tự:

1. `exit` phải khác 0 vì `missing.txt` không tồn tại trong thư mục mới; không cần phụ thuộc chính xác số lỗi.
2. `output.txt` có ba dòng hợp lệ từ `input.txt`.
3. `error.txt` có chẩn đoán nhắc tới `missing.txt`; tiếng Anh thường là `No such file or directory`, nhưng ngôn ngữ phụ thuộc môi trường.
4. `wc -l` cho mỗi file 3 ký tự xuống dòng và một dòng tổng 6. Tổng này chỉ là phép cộng đếm, không chứng minh `cat` thành công.

Nếu `output.txt` rỗng, kiểm tra `cat input.txt`, `pwd` và nội dung `error.txt`. Nếu không tạo được file lỗi hoặc đầu ra, lỗi có thể đến từ shell trước khi `cat` chạy; thông báo ấy không nhất thiết nằm trong file bạn định tạo.

### 7.3. Đếm dữ liệu qua pipeline và xác nhận báo cáo

```bash
(
    set -o pipefail
    LC_ALL=C sort input.txt | uniq -c | tee counts.txt
    result=$?
    printf 'pipeline_exit=%s\n' "$result"
)
cat counts.txt
wc -l input.txt
```

Ở đây `pipefail` chỉ bật trong subshell. Báo cáo phải có `2 alpha` và `1 beta`; tổng số đếm 3 bằng số dòng của nguồn trong ví dụ có xuống dòng đầy đủ. `pipeline_exit=0` cho biết các công cụ báo thành công; vẫn cần xác nhận báo cáo đúng yêu cầu vì mã kết thúc không đánh giá ý nghĩa nghiệp vụ. File `counts.txt` có hai dòng nhóm, nên số dòng báo cáo không phải tổng số bản ghi nguồn.

Thử hai lệnh `false | true` ở mục 5 để giải thích khác biệt default/pipefail. Với pipeline thật, kiểm tra lỗi ở từng công cụ nếu báo cáo thiếu, đặc biệt khi file đích không ghi được.

### 7.4. Quan sát ghi nối và thứ tự chuyển hướng

```bash
printf 'first\n' > append.txt
printf 'second\n' >> append.txt
cat append.txt
{ printf 'DATA\n'; printf 'ERROR\n' >&2; } > all.txt 2>&1
{ printf 'DATA\n'; printf 'ERROR\n' >&2; } 2>&1 > out.txt
cat all.txt
cat out.txt
```

`append.txt` phải giữ cả `first` và `second`. Chỉ chạy lại dòng có `>>` sẽ thêm một `second` nữa; ghi nối không tự loại trùng. Với hai nhóm còn lại, đối chiếu đường đi FD theo sơ đồ mục 3.3. Không suy luận “màn hình không báo lỗi” nghĩa là không có lỗi: có thể stderr đã được lưu sang nơi khác.

### 7.5. Thay nội dung bằng file tạm sau khi xử lý thành công

Chỉ dùng mẫu sau với file riêng trong lab, không có chương trình khác đang sửa nó:

```bash
(
    temp_file=$(mktemp ./input.sorted.XXXXXX) || exit 1
    if LC_ALL=C sort input.txt > "$temp_file"; then
        if mv -- "$temp_file" input.txt; then
            printf 'Da thay input.txt bang ban da sap xep\n'
        else
            printf 'Khong thay duoc file; ban tam con o %s\n' "$temp_file" >&2
            exit 1
        fi
    else
        rm -- "$temp_file"
        printf 'Sort that bai; giu nguyen input.txt\n' >&2
        exit 1
    fi
)
cat input.txt
stat input.txt
```

`||` chỉ chạy vế sau nếu vế trước thất bại; `exit 1` kết thúc subshell với trạng thái lỗi. `if ...; then ...; else ...; fi` chọn nhánh theo trạng thái lệnh. File tạm nằm cùng thư mục để bước đổi tên nằm trong cùng filesystem thông thường. `sort` chỉ ghi vào file tạm; chỉ khi nó báo thành công mới thay tên đích. Nếu `mv` thất bại, mẫu giữ file tạm và in vị trí để xem lại.

**Minh họa:** nguồn sau thay là `alpha`, `alpha`, `beta`. Nếu `sort` lỗi, nguồn cũ còn nguyên và bản tạm được xóa nếu `rm` thành công. Đây là mẫu tránh tự làm rỗng đầu vào, không phải cơ chế backup hay cập nhật đồng thời an toàn. File mới có inode và metadata của file tạm: `mktemp` thường tạo quyền chỉ chủ sở hữu đọc/ghi, nên quyền hoặc chủ sở hữu có thể khác nguồn cũ. Không áp dụng nguyên xi cho file cấu hình hệ thống, liên kết hoặc file đang được nhiều bên sửa; mẫu cũng chưa thực hiện đồng bộ bền vững qua mất điện.

### 7.6. Tự chứng minh xóa tên khác với đóng file

Đây là bài thử Bash trong subshell, chỉ xóa một file nhỏ do bạn vừa tạo:

```bash
(
    printf 'du lieu van con\n' > held.txt
    exec 3< held.txt
    rm -- held.txt
    if test -e held.txt; then
        printf 'Ten van ton tai\n'
    else
        printf 'Ten da bi xoa\n'
    fi
    cat <&3
    exec 3<&-
)
```

`exec` không kèm tên chương trình ở đây áp dụng chuyển hướng cho shell hiện tại: `3<` mở file đọc qua FD 3, `<&3` cho stdin của `cat` dùng FD ấy, `3<&-` đóng FD 3. `test -e` kiểm tra đường dẫn còn tồn tại hay không. **Minh họa:** thấy `Ten da bi xoa` rồi vẫn thấy `du lieu van con`. Đây là đọc từ tham chiếu đã mở, không khôi phục tên bằng `cat`.

Ví dụ chứng minh cơ chế tham chiếu mở, không chứng minh dung lượng đã giảm một lượng cụ thể: file nhỏ, cách cấp phát và lớp lưu trữ làm phép đo khác nhau. Trên filesystem mạng, xử lý tên đang mở có thể có khác biệt; ưu tiên thử trên filesystem cục bộ thông thường.

### 7.7. Kết quả cần giữ và cách kết thúc lab

Giữ `input.txt`, `output.txt`, `error.txt`, `counts.txt`, kèm giải thích trạng thái của `cat` và pipeline. Lưu ý sau bước 7.5, `input.txt` đã sắp xếp còn `output.txt` là nội dung ở bước 7.2; khác thứ tự không phải tự động là lỗi.

Dùng `printf '%s\n' "$lab_dir"` để biết nơi lưu. Có thể giữ thư mục làm bài nộp; không cần xóa để hoàn thành. Khi dọn thủ công, xác nhận `pwd` và đường dẫn trước, chỉ xóa thư mục lab cụ thể do mình tạo. Không dùng lệnh xóa đệ quy với biến rỗng hoặc đường dẫn chưa kiểm tra.

## 8. Những lỗi thường gặp và cách kiểm tra lại

### 8.1. Tên file có khoảng trắng hoặc xuống dòng

Dấu nháy giữ tên thành một đối số: `cp -- "bao cao.txt" "ban sao.txt"`. Nhưng chỉ thêm dấu nháy quanh toàn bộ đầu ra `ls` không biến nó thành danh sách tên đáng tin cậy. Tên file Linux có thể chứa khoảng trắng và ký tự xuống dòng, nên đọc “mỗi dòng là một tên” có thể chia sai.

**NUL** là byte có giá trị 0, khác ký tự chữ `0`. Nó không được xuất hiện trong tên file Linux, nên có thể dùng làm dấu phân cách rõ ràng. GNU `find -print0` xuất mỗi đường dẫn kết thúc bằng NUL. `find` là công cụ duyệt cây thư mục và chọn đối tượng theo điều kiện; `xargs` biến dữ liệu đầu vào thành các đối số cho lệnh, `-0` yêu cầu đọc phân cách NUL.

Ví dụ chỉ đếm byte của từng file `.txt` dưới thư mục lab:

```bash
find . -type f -name '*.txt' -print0 | xargs -0 -r wc -c --
```

`-type f` chọn file thông thường; mẫu `'*.txt'` có dấu nháy để shell không mở rộng trước khi `find` nhận nó. `-r` của GNU `xargs` tránh chạy lệnh khi không có tên. Đường dẫn được truyền nguyên vẹn kể cả có xuống dòng; tuy vậy cách `wc` in tên ra màn hình vẫn có thể khó đọc, và `xargs` có thể chia thành nhiều lần chạy nếu danh sách lớn, tạo nhiều dòng tổng.

Một lựa chọn không cần luồng phân cách tên là `find . -type f -name '*.txt' -exec wc -c -- {} +`: `find` đưa các tên trực tiếp làm đối số, `{}` là vị trí tên được chèn và `+` yêu cầu gom nhiều tên trong mỗi lần chạy. Cả hai cách không bảo đảm file không bị đổi giữa lúc tìm và lúc xử lý. Tra [GNU Findutils manual](https://www.gnu.org/software/findutils/manual/) và trợ giúp phiên bản địa phương; trên BusyBox hãy kiểm tra hỗ trợ `-print0`, `-0`, `-r`.

### 8.2. `Permission denied` khi dùng redirect

Thông báo này nghĩa là thao tác bị từ chối quyền. Với `cmd > file`, kiểm tra `ls -ld .` và `ls -l file` nếu file tồn tại: `-d` yêu cầu xem bản thân thư mục thay vì liệt kê bên trong. Còn có thể do filesystem chỉ đọc hoặc chính sách bảo mật khác, nên các bit quyền cơ bản không phải toàn bộ lời giải.

Trong `sudo cmd > file`, `sudo` nâng quyền cho `cmd` theo chính sách cho phép, nhưng shell đang chạy vẫn thực hiện `>` bằng quyền của nó. Bài lab không cần `sudo`; hãy giải quyết đường dẫn và quyền trong thư mục cá nhân trước khi học sửa file hệ thống.

### 8.3. Nhầm file không rỗng hoặc stderr có chữ với trạng thái thành công/thất bại

File không rỗng có thể là kết quả một phần hoặc dữ liệu cũ khi dùng append. Stderr có thể chứa cảnh báo dù lệnh thành công. Kiểm tra đồng thời: trạng thái kết thúc, chẩn đoán và nội dung có thỏa yêu cầu hay không. Lưu `$?` ngay sau thao tác quan trọng, không sau `cat` dùng để xem kết quả.

### 8.4. Nhầm nơi lưu với dữ liệu của pipe

`a | b` không tự tạo file bền vững. Muốn giữ kết quả cần `>` hoặc `tee`. `/dev/null` là đích đặc biệt bỏ dữ liệu được ghi vào, ví dụ `cmd > /dev/null` bỏ stdout nhưng giữ stderr; nó không ghi báo cáo để xem lại và không chứng minh lệnh thành công.

### 8.5. Đưa mọi lỗi vào dữ liệu rồi đếm

`cat input.txt missing.txt 2>&1 | wc -l` đếm cả dòng chẩn đoán. Con số có thể lớn hơn số bản ghi đúng; trạng thái mặc định còn là của `wc`. Giữ stderr riêng và kiểm tra pipeline trước khi dùng số đếm.

## 9. Tự kiểm tra: áp dụng vào tình huống mới

Hãy trả lời trước khi xem tiêu chí đối chiếu:

1. `cat a.txt b.txt > report.txt 2> errors.txt` tạo báo cáo có dữ liệu nhưng `cat` trả khác 0. Bạn có nên chấp nhận báo cáo đầy đủ không?
2. Với stdout ban đầu ở terminal, `cmd 2>&1 > out.txt` đưa lỗi đi đâu? Vì sao?
3. `printf 'x\n' > x.txt | wc -l` đếm bao nhiêu? Dữ liệu nằm ở đâu?
4. Trong Bash, `false | true` trả gì khi tắt và bật `pipefail`? Làm sao biết trạng thái từng thành phần?
5. Vì sao `uniq -c input.txt` không nhất thiết đếm mọi lần xuất hiện của cùng một dòng?
6. File có quyền chỉ đọc thì có chắc không xóa được tên không? `rm` có luôn giải phóng dung lượng ngay không?
7. Đổi tên thành công trong cùng filesystem chứng minh điều gì và chưa chứng minh điều gì khi mất điện?
8. Viết quy trình sắp xếp file mà lỗi ở `sort` không làm mất nguồn. Quy trình đó có giữ nguyên metadata không?

**Tiêu chí tự đối chiếu:**

- Câu 1: nhận ra kết quả một phần; đọc lỗi, xác định nguồn thiếu và yêu cầu báo cáo trước khi chấp nhận.
- Câu 2–3: vẽ đúng đích FD theo thứ tự; stderr đi tới stdout cũ, còn `wc` nhận pipe rỗng và đếm 0, `x` nằm trong file.
- Câu 4: mặc định 0, bật `pipefail` là 1; sao chép `PIPESTATUS` ngay để thấy `[1, 0]`.
- Câu 5: `uniq` chỉ gộp nhóm liền kề; phải chọn cách sắp xếp phù hợp trước nếu muốn đếm toàn bộ.
- Câu 6: quyền thao tác tên phụ thuộc thư mục và cơ chế bảo vệ; hard link hoặc tham chiếu mở có thể giữ file tồn tại.
- Câu 7: tính nguyên tử của đổi tên khác với đồng bộ dữ liệu và tên xuống thiết bị.
- Câu 8: ghi file tạm, kiểm tra xử lý thành công rồi đổi tên; nhận ra metadata của file tạm và giới hạn mất điện/đồng thời.

## 10. Tóm tắt mô hình cần nhớ

Shell chuẩn bị đường đọc/ghi; chương trình xử lý byte; kernel thực hiện truy cập tài nguyên. FD 0, 1, 2 là ba đường chuẩn, không phải ba file bắt buộc trên đĩa. Redirect đổi nguồn/đích theo thứ tự, pipe nối stdout sang stdin, còn mã kết thúc là thông tin riêng cần kiểm tra.

Tên file là một đường tìm tới đối tượng; bản sao, đổi tên và gỡ tên là ba việc khác nhau. Giữ báo cáo đúng đòi hỏi vừa bảo vệ nguồn vừa kiểm tra lỗi và nội dung, không chỉ thấy chữ xuất hiện trên màn hình. Bài 09 sẽ dùng các đường dữ liệu này để lọc và biến đổi văn bản.

## Tài liệu để kiểm chứng và đọc tiếp

Các nguồn đã đối chiếu khi biên soạn; tài liệu trực tuyến có thể mô tả phiên bản mới hơn công cụ đã cài. Khi khác biệt, kiểm tra `--version`, trợ giúp và trang hướng dẫn trên máy:

- [Bash — Redirections](https://www.gnu.org/software/bash/manual/html_node/Redirections.html): mở, làm rỗng, ghi nối và thứ tự chuyển hướng.
- [Bash — Pipelines](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html): kết nối pipe và trạng thái với `pipefail`.
- [GNU Coreutils manual](https://www.gnu.org/software/coreutils/manual/): các mục `cat`, `sort`, `uniq`, `tee`, `wc`, `cp`, `mv`, `rm`, `stat`, `mktemp`.
- [GNU Findutils manual](https://www.gnu.org/software/findutils/manual/): truyền tên file an toàn với `find` và `xargs`.
- [Linux open(2)](https://man7.org/linux/man-pages/man2/open.2.html), [pipe(7)](https://man7.org/linux/man-pages/man7/pipe.7.html), [unlink(2)](https://man7.org/linux/man-pages/man2/unlink.2.html), [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html), [fsync(2)](https://man7.org/linux/man-pages/man2/fsync.2.html): cơ chế kernel và giới hạn.

`man` là công cụ đọc trang hướng dẫn cài trên máy; thử `man bash`, `man cp`, `man tee`, `man 7 pipe`. Số 7 chọn nhóm trang về khái niệm; số 2 trong `man 2 rename` chọn nhóm lời gọi hệ thống, tránh nhầm với công cụ cùng tên. Thiết bị tối giản có thể không cài `man`; khi ấy dùng tài liệu trực tuyến và trợ giúp của chính công cụ.
