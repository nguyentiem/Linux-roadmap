# Bài 09 — Tìm kiếm, regex và xử lý văn bản

[Mục lục](../README.md) · [← Bài 08](08-file-va-luong-du-lieu.md) · [Bài 10 →](10-user-va-phan-quyen.md)

## Mục tiêu

Bài 08 giúp bạn nối đường dữ liệu giữa các lệnh. Bài này dùng những đường ấy để trả lời câu hỏi thực tế: một dịch vụ nhận bao nhiêu yêu cầu, bao nhiêu yêu cầu lỗi, địa chỉ nào xuất hiện nhiều nhất và thời gian xử lý trung bình là bao nhiêu?

Sau bài học, bạn cần:

- Chọn công cụ theo việc cần làm: tìm chuỗi, lọc dòng, lấy trường, thay chữ, sắp xếp hay tổng hợp.
- Đọc được các biểu thức tìm kiếm cơ bản và biết cú pháp nào thuộc shell, cú pháp nào thuộc công cụ.
- Tạo báo cáo từ log có quy tắc rõ ràng; kiểm tra dữ liệu đầu vào trước khi tính.
- Phân biệt không tìm thấy với lỗi thực thi; nhận ra ảnh hưởng của ký tự xuống dòng và môi trường ngôn ngữ.
- Biết khi nào cần bộ phân tích JSON, CSV hoặc YAML thay vì tự tách chuỗi.

Phạm vi chính: Linux, Bash, GNU `grep`, GNU `sed`, các công cụ GNU Coreutils và một bản `awk` hỗ trợ cú pháp cơ bản trong bài. `awk` trên máy có thể là `gawk`, `mawk` hoặc bản của BusyBox; không mặc định tất cả tùy chọn mở rộng giống nhau. `jq`, `rg` và Python 3 là phần thực hành bổ sung. Mọi đầu ra ghi **minh họa** là kết quả dự kiến của dữ liệu mẫu, không phải khẳng định về log hay môi trường của bạn.

## 1. Muốn phân tích văn bản, trước tiên phải biết mình đang đọc gì

### 1.1. Dòng, trường và bản ghi khác nhau thế nào?

**Văn bản** là dữ liệu được biểu diễn bằng các ký tự theo một quy tắc mã hóa. **Mã hóa** là cách chuyển ký tự thành các byte lưu trong file; byte là đơn vị 8 bit dữ liệu. Ví dụ UTF-8 biểu diễn chữ Việt bằng một hoặc nhiều byte cho mỗi ký tự. Vì thế “cắt 10 byte” không luôn là “lấy 10 ký tự”.

**Dòng (line)** là phần văn bản thường kết thúc bằng ký tự xuống dòng. **Trường (field)** là một phần dữ liệu có ý nghĩa trong một bản ghi, ví dụ trạng thái xử lý. **Bản ghi (record)** là một đơn vị thông tin, ví dụ một yêu cầu gửi tới dịch vụ. Trong log mẫu của bài, mỗi bản ghi nằm trên một dòng; với CSV có trường chứa xuống dòng, một bản ghi có thể trải qua nhiều dòng vật lý.

**Log (nhật ký)** là dữ liệu ghi lại các sự kiện để kiểm tra hoạt động. **Access log (nhật ký truy cập)** ghi các yêu cầu truy cập. Dòng sau là một bản ghi mẫu:

```text
10.0.0.1 POST /orders 500 93
```

Để đọc đúng, cần biết **schema (quy tắc cấu trúc dữ liệu)**: mỗi trường là gì, thứ tự nào, kiểu giá trị nào và dấu phân cách ra sao. Schema của bài là:

| Vị trí | Tên | Nghĩa trong ví dụ | Điều kiện của dữ liệu mẫu |
|---|---|---|---|
| 1 | IP | Địa chỉ mạng của bên gửi yêu cầu, như `10.0.0.1` | Một chuỗi không chứa khoảng trắng |
| 2 | method | Phương thức HTTP, ví dụ `GET` hoặc `POST` | Một chuỗi không chứa khoảng trắng |
| 3 | path | Đường dẫn tài nguyên được yêu cầu, như `/orders` | Bắt đầu bằng `/`, không chứa khoảng trắng |
| 4 | status | Mã kết quả HTTP, như `200`, `500` | Ba chữ số, trong miền 100–599 |
| 5 | latency_ms | Thời gian xử lý do log ghi lại, đơn vị mili giây | Số nguyên không âm trong bài này |

**HTTP** là giao thức, tức quy tắc trao đổi yêu cầu và phản hồi giữa các bên, thường dùng cho web. `GET` thường yêu cầu lấy tài nguyên, `POST` gửi dữ liệu để xử lý. **Status code (mã trạng thái)** là số trong phản hồi; nhóm **5xx** là các mã 500–599, báo lỗi phía máy chủ theo phân loại HTTP. Một mili giây là một phần nghìn giây; `93` trong cột cuối nghĩa là 93 ms theo quy ước log, không phải số byte.

Bảng cho thấy vì sao không được đoán ý nghĩa cột chỉ từ con số. `500` ở cột thời gian khác `500` ở cột status. Schema này là **do bài học đặt ra**, không phải định dạng chung của mọi web server. Ngoài đời cần đọc cấu hình ghi log và tài liệu dịch vụ; ý nghĩa thời gian có thể chỉ bao gồm một phần quá trình xử lý. Phân loại HTTP có thể đối chiếu trong [RFC 9110: Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#section-15).

### 1.2. Các công cụ nhận dữ liệu và trả kết quả ở đâu?

**Shell** là chương trình diễn giải lệnh, chẳng hạn Bash. **Stdin** là đường đầu vào chuẩn; **stdout** là đường kết quả chuẩn; **stderr** là đường chẩn đoán riêng. **Pipe**, ký hiệu `|`, nối stdout của lệnh bên trái vào stdin của lệnh bên phải. Nhắc lại ngắn các khái niệm này vì mọi pipeline dưới đây dựa vào chúng.

Ví dụ `awk '{print $1}' access.log | sort | uniq -c` lấy địa chỉ, sắp xếp rồi đếm nhóm. Mỗi công cụ nhận kết quả của công cụ trước, không tự biết câu hỏi nghiệp vụ ban đầu. Nếu công cụ đầu tách sai trường, các bước sau vẫn có thể chạy thành công và cho con số sai.

```text
File log
   |
   v
Kiểm tra schema ---- dòng sai ----> chẩn đoán riêng
   |
   | bản ghi hợp lệ
   v
Lấy trường cần dùng -> lọc / nhóm / tính -> định dạng báo cáo
```

Đọc từ trên xuống: kiểm tra đầu vào trước khi tin các trường, sau đó mới biến đổi. Nhánh chẩn đoán cần giữ riêng để không bị đếm như bản ghi hợp lệ. Sơ đồ là quy trình tư duy; lab sẽ triển khai thành những bước có thể quan sát, không giả định một lệnh bất kỳ tự làm đủ tất cả.

## 2. Chọn công cụ theo câu hỏi, không theo độ dài câu lệnh

Bảng dưới đây là bản đồ công cụ. Các mục tiếp theo sẽ giải thích cú pháp qua cùng một bộ dữ liệu:

| Cần làm | Công cụ | Giới hạn cần nhớ |
|---|---|---|
| Tìm dòng chứa chuỗi hoặc khớp mẫu | `grep` | Tìm ở văn bản, không tự biết schema |
| Tìm nội dung trong cây mã nguồn | `rg` (ripgrep) | Có quy tắc bỏ qua file mặc định |
| Sắp xếp dòng hoặc khóa | `sort` | Có thể đổi thứ tự sự kiện và cần file tạm |
| Gộp/đếm dòng giống nhau liền kề | `uniq` | Không tự tìm mọi dòng trùng trong toàn file |
| Lấy trường với dấu phân cách đơn giản | `cut` | Không hiểu dấu nháy bảo vệ trường CSV |
| Đổi hoặc xóa ký tự | `tr` | Xử lý ký tự, không thay một từ bằng một từ |
| Thay văn bản, chọn dòng | `sed` | Cần hiểu mẫu và quy tắc thay thế |
| Lọc theo trường, nhóm, tính toán | `awk` | Phải xác định cách chia trường và kiểm tra kiểu dữ liệu |
| Đọc giá trị JSON | `jq` | Cú pháp hợp lệ chưa bảo đảm đúng schema |

Một pipeline tốt là chuỗi phép biến đổi có thể giải thích được. Với yêu cầu “đếm theo IP”, hãy nói rõ: lấy IP → đưa IP bằng nhau cạnh nhau → đếm → xếp số đếm. Không dùng thêm công cụ chỉ vì thường thấy người khác ghép chúng.

## 3. Tìm chuỗi hay tìm một quy luật: `grep` và regex

### 3.1. Khi muốn tìm đúng chữ, hãy bắt đầu bằng chuỗi cố định

`grep` đọc văn bản và chọn những dòng khớp mẫu. **Mẫu (pattern)** là tiêu chí tìm kiếm. **Chuỗi cố định (fixed string)** là dãy ký tự được tìm nguyên dạng, không diễn giải ký tự như `.` thành toán tử.

```bash
grep -nF -- '/orders' access.log
```

`-F` tìm chuỗi cố định, `-n` thêm số dòng, `--` kết thúc phần tùy chọn để mẫu bắt đầu bằng `-` không bị hiểu là tùy chọn. **Minh họa:** chọn dòng 3 và 5 của file mẫu. Số dòng chỉ giúp tìm vị trí trong file đang đọc; sau khi lọc hoặc sắp xếp sang file khác, số dòng sẽ không còn là vị trí gốc.

`grep -F '500' access.log` không có nghĩa “status bằng 500”: nó còn có thể khớp đường dẫn `/items/500` hay thời gian `500`. Muốn kiểm tra trường status, dùng `awk` sau khi hiểu schema ở mục 5.

### 3.2. Regex là gì, tại sao cần?

**Regular expression (regex, biểu thức chính quy)** là một ngôn ngữ mô tả mẫu ký tự, giúp tìm cả một họ chuỗi. Ví dụ không chỉ tìm chữ `500`, mà tìm mọi mã có chữ số đầu là 5 và hai chữ số phía sau.

Với `grep -E`, bạn dùng **extended regular expression (ERE, biểu thức chính quy mở rộng)**. `grep` mặc định dùng **basic regular expression (BRE, biểu thức chính quy cơ bản)**; một số toán tử có cách viết khác. Bài dùng `-E` khi có `+`, `|`, nhóm `(...)` hoặc `{...}` để tránh phải đoán biến thể cú pháp.

Các ký hiệu sau được hiểu trong phạm vi tìm từng dòng văn bản:

| Ký hiệu ERE | Cách hiểu | Ví dụ |
|---|---|---|
| `^` | Neo vị trí đầu dòng | `^10` chọn dòng bắt đầu bằng `10` |
| `$` | Neo vị trí cuối dòng | `93$` chọn dòng kết thúc bằng `93` |
| `.` | Một ký tự bất kỳ | `5..` không chỉ khớp chữ số |
| `[0-9]` | Một chữ số trong khoảng ghi ra | `5[0-9][0-9]` khớp ba chữ số đầu 5 |
| `[[:space:]]` | Một ký tự thuộc lớp khoảng trắng | Dùng để nhận dấu phân cách |
| `*` | Lặp phần ngay trước 0 lần hoặc nhiều lần | `a*` có thể khớp cả chuỗi rỗng |
| `+` | Lặp phần ngay trước ít nhất một lần | `[0-9]+` khớp một dãy chữ số |
| `?` | Phần ngay trước có hoặc không có | `colou?r` nhận `color` hoặc `colour` |
| `{3}` | Lặp đúng ba lần | `[0-9]{3}` |
| `(...)` | Gom thành nhóm | `(GET|POST)` |
| `|` | Chọn một trong các nhánh | `GET|POST` |
| `\.` | Dấu chấm nguyên dạng | `10\.0\.0\.1` |

**Neo (anchor)** kiểm tra vị trí mà không ăn một ký tự. **Lớp ký tự (character class)** mô tả nhóm ký tự, như chữ số hay khoảng trắng. **Escape** là viết ký hiệu theo cách để nó được hiểu nguyên dạng hoặc mang ý nghĩa đặc biệt trong ngôn ngữ đang dùng; trong regex, `\.` làm dấu chấm trở thành dấu chấm thật.

Hãy thử bằng các ví dụ nhỏ để tự đọc phạm vi khớp:

```bash
printf '%s\n' '500' '503' '1500' '5ab' | grep -E '^5[0-9]{2}$'
printf '%s\n' 'ab' 'aab' 'b' | grep -E '^a*b$'
```

**Minh họa:** lệnh đầu chọn `500`, `503`, loại `1500` và `5ab`. Lệnh sau chọn cả ba dòng: `a*` cho phép không có chữ `a`. Nếu bỏ neo, regex có thể khớp một đoạn bên trong chuỗi dài hơn. Tự kiểm chứng bằng cách bỏ từng neo rồi thêm dữ liệu phản ví dụ.

Regex không phải mẫu tên file của shell: `*.log` trong shell nghĩa là các tên kết thúc `.log`, còn `*` trong regex lặp phần phía trước. Muốn regex nhận hậu tố `.log`, có thể viết `\.log$`. Mỗi công cụ còn có biến thể regex riêng; không sao chép cú pháp đặc biệt giữa `grep -E`, `grep -P`, `sed` và `rg` mà chưa kiểm tra. Xem [GNU Grep: Regular Expressions](https://www.gnu.org/software/grep/manual/html_node/Regular-Expressions.html).

### 3.3. Tại sao phải đặt mẫu trong dấu nháy?

```bash
grep -E ' (GET|POST) ' access.log
```

Dấu nháy đơn giữ nguyên chuỗi mẫu cho `grep`. Nếu viết `GET|POST` không có nháy, shell có thể hiểu `|` là pipe trước khi `grep` nhận nó. Dấu nháy đơn còn bảo vệ `$` trong chương trình `awk` để Bash không thay `$4` bằng một giá trị của shell.

Thứ tự xử lý là: **shell đọc câu lệnh → tạo đối số → công cụ diễn giải đối số theo ngôn ngữ của nó**. Nháy đúng ở lớp shell chưa có nghĩa mẫu đúng ở lớp regex. Khi cần tìm một chuỗi người dùng cung cấp, ưu tiên `grep -F -- "$needle" file` thay vì tự ghép chuỗi ấy vào regex; `needle` là biến chứa chuỗi tìm kiếm, nháy kép giữ nguyên một đối số.

### 3.4. Không tìm thấy có phải là lỗi chương trình?

**Exit status (trạng thái kết thúc)** là số shell nhận khi lệnh xong. Với GNU `grep` thông thường:

- 0: có dòng được chọn.
- 1: không có dòng được chọn.
- 2: có lỗi xử lý, chẳng hạn không mở được file.

```bash
grep -F -- '/absent' access.log
result=$?
printf 'grep_status=%s\n' "$result"
```

`$?` là trạng thái lệnh vừa chạy; lưu ngay vào `result` vì lệnh tiếp theo thay nó. **Minh họa:** status 1 với file hợp lệ nhưng không có chuỗi. Thử một tên file không tồn tại để đối chiếu với lỗi mở file và stderr, đường chẩn đoán chuẩn.

`grep -q` chỉ hỏi có khớp hay không, không in dòng. Có một ngoại lệ GNU quan trọng: nếu `-q` đã tìm được dòng khớp, trạng thái có thể là 0 dù có lỗi khác. Vì vậy không dùng nó để chứng minh mọi file trong một tập đầu vào đã được đọc thành công. Các bản `grep` khác có thể trả số lỗi lớn hơn 2. Xem [GNU Grep: Exit Status](https://www.gnu.org/s/grep/manual/html_node/Exit-Status.html).

Trong Bash có `pipefail`, pipeline không tìm được dòng qua `grep` có thể có trạng thái 1 dù các bước sau chạy đúng. `pipefail` là tùy chọn làm trạng thái pipeline phản ánh thành phần thất bại, không tự phân loại “không có kết quả” với “đọc file lỗi”. Đọc ý nghĩa của status theo từng công cụ trước khi xử lý.

## 4. Lấy phần cần dùng và biến đổi văn bản bằng công cụ nhỏ

### 4.1. `cut` phù hợp với kiểu dấu phân cách nào?

**Delimiter (dấu phân cách)** là ký tự hoặc quy tắc đánh dấu ranh giới giữa các trường. `cut -d ':' -f 1` lấy trường thứ nhất khi dấu phân cách là dấu hai chấm:

```bash
printf '%s\n' 'alice:admin' 'bob:reader' | cut -d ':' -f 1
```

**Minh họa:** `alice`, `bob`. `-d` chọn dấu phân cách, `-f` chọn số thứ tự trường. Mặc định phân cách của `cut -f` là tab, ký tự dùng để căn hoặc tách cột. `cut -b` chọn byte; không áp dụng cắt byte tùy ý vào văn bản UTF-8 nếu muốn giữ ký tự nguyên vẹn.

`cut -d ' ' -f 4 access.log` chỉ đúng khi các dòng có đúng cách bố trí dấu cách mong đợi. Hai dấu cách liên tiếp tạo thêm trường rỗng đối với kiểu chia này; một tab cũng không phải dấu cách được chọn. Với log cho phép nhiều dấu cách/tab, dùng cách tách mặc định của `awk`.

Tự thử giới hạn:

```bash
printf 'a  b c d\n' | cut -d ' ' -f 2
printf 'a  b c d\n' | awk '{print $2}'
```

**Minh họa:** `cut` in một dòng rỗng, `awk` in `b`. Kết luận là hai công cụ đang áp dụng hai quy tắc chia khác nhau, không phải một công cụ luôn “tốt hơn”.

### 4.2. `tr` đổi ký tự, không thay từ

```bash
printf 'get post\n' | LC_ALL=C tr '[:lower:]' '[:upper:]'
printf 'a,b,c\n' | tr ',' '\n'
```

`tr` đọc stdin và chuyển từng ký tự giữa hai tập. **Minh họa:** dòng đầu thành `GET POST`; dòng sau thành ba dòng `a`, `b`, `c`. `tr -d` xóa các ký tự trong tập, `tr -s` gộp các lần lặp ký tự thuộc tập đã chọn.

`tr 'cat' 'dog'` ánh xạ `c` sang `d`, `a` sang `o`, `t` sang `g` ở mọi nơi; nó không nhận diện từ `cat`. Muốn thay chuỗi, dùng `sed`. Những ví dụ `tr` ở đây giới hạn ở ký tự ASCII, tức bộ ký tự cơ bản gồm chữ Latin không dấu và dấu thông dụng; không coi việc chuyển hoa/thường bằng GNU `tr` là giải pháp đầy đủ cho mọi chữ Unicode. Đối chiếu [GNU Coreutils: tr](https://www.gnu.org/software/coreutils/manual/html_node/tr-invocation.html).

### 4.3. `sed` thay chữ nhưng có tự sửa file nguồn không?

`sed` là công cụ chỉnh sửa luồng văn bản. Trong cách dùng cơ bản, nó đọc từng dòng vào vùng làm việc, áp dụng lệnh rồi in kết quả ra stdout. Mẫu sau chỉ tạo đầu ra đã sửa, không đổi file nguồn:

```bash
sed 's/\/orders/\/purchases/g' access.log
```

Lệnh `s/mẫu/thay-thế/g` thực hiện thay chuỗi khớp regex. `g` thay mọi lần khớp trong vùng đang xử lý; không có `g` thì chỉ thay lần khớp đầu. Dùng dấu phân cách khác để dễ đọc đường dẫn:

```bash
sed 's@/orders@/purchases@g' access.log > renamed-paths.log
sed -n '1,3p' access.log
```

`@` trong lệnh đầu đóng vai trò phân cách thay cho `/`; `renamed-paths.log` nhận kết quả. Ở lệnh sau, `-n` tắt việc tự in mỗi dòng; `1,3` chọn dòng 1 đến 3, `p` in những dòng ấy. Quên `-n` có thể làm một dòng được in tự động rồi in thêm bởi `p`.

Tự kiểm tra bằng `grep -nF '/orders' access.log` và `grep -nF '/purchases' renamed-paths.log`. Giới hạn: thay toàn dòng có thể đổi cả phần không phải path nếu nó cũng chứa chuỗi đó. Trong phần thay thế, `&` có nghĩa là toàn bộ đoạn vừa khớp, không mặc định là ký tự `&` nguyên dạng. `sed -i` sửa file tại chỗ với khác biệt cú pháp giữa các bản; bài dùng file đích riêng để xem kết quả trước. Tuyệt đối không `sed '...' file > file`: shell có thể làm rỗng nguồn trước, như bài 08.

Xem [GNU sed: lệnh s](https://www.gnu.org/software/sed/manual/html_node/The-_0022s_0022-Command.html) và [GNU sed manual](https://www.gnu.org/software/sed/manual/sed.html).

### 4.4. `sort` và `uniq` phối hợp để đếm như thế nào?

```bash
printf '%s\n' a b a | uniq -c
printf '%s\n' a b a | LC_ALL=C sort | uniq -c
printf '%s\n' 2 10 3 | sort
printf '%s\n' 2 10 3 | sort -n
```

`sort` sắp xếp dòng; `uniq` gộp những dòng giống nhau **liền kề**, `-c` in số dòng trong nhóm. **Minh họa:** lệnh đầu có ba nhóm đếm 1; lệnh thứ hai cho `2 a` và `1 b`. Hai dòng `a` phải nằm cạnh nhau trước khi `uniq` đếm chung.

Sắp xếp chuỗi số và sắp xếp theo số khác nhau: theo quy tắc C, thứ tự chuỗi là `10, 2, 3`; `sort -n` cho `2, 3, 10`. `-r` đảo chiều; `sort -nr` thường dùng xếp số đếm lớn trước.

**Locale** là tập thiết lập ngôn ngữ, cách so sánh ký tự và biểu diễn số. `LC_ALL=C` chọn quy tắc C cho lệnh phía sau, phù hợp để xử lý dữ liệu ASCII có yêu cầu ổn định. Trong `LC_ALL=C sort | uniq`, thiết lập chỉ áp dụng cho `sort`, không tự lan sang mọi lệnh trong pipeline. Trong lab sẽ đặt nó trong subshell cho cả quy trình.

Sắp xếp theo byte ổn định không phải sắp tên tiếng Việt theo quy tắc ngôn ngữ tự nhiên. Locale còn ảnh hưởng các lớp ký tự như `[[:alpha:]]`. Dùng `locale` để xem thiết lập thực tế, `locale -a` để xem các locale có sẵn. Đọc [GNU Coreutils: sort](https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html) trước khi áp dụng khóa phức tạp hoặc dữ liệu lớn.

## 5. `awk`: từ dòng văn bản đến tính toán theo trường

### 5.1. Một chương trình `awk` được chạy theo thứ tự nào?

`awk` là công cụ và ngôn ngữ nhỏ để xử lý bản ghi theo **điều kiện → hành động**. Trong cách dùng mặc định của bài, mỗi dòng là một bản ghi; `awk` chia dòng theo các đoạn khoảng trắng liên tiếp, gồm dấu cách và tab, bỏ khoảng trắng đầu/cuối khi chia trường.

```bash
awk '{print $1, $4, $5}' access.log
```

Bên trong chương trình `awk`, `$1` là trường thứ nhất, `$4` là trường thứ tư, `$0` là toàn bản ghi. Dấu `$` ở đây thuộc ngôn ngữ `awk`, khác với `$?` của shell. `print` xuất giá trị, dấu phẩy giữa các biểu thức tạo dấu phân cách đầu ra mặc định là một dấu cách.

```text
Đọc một dòng -> chia trường -> xét điều kiện -> thực hiện hành động
      ^                                             |
      +---------------- dòng kế tiếp ---------------+
                        |
                  hết đầu vào
                        v
                    khối END
```

Sơ đồ giải thích vòng xử lý: mỗi dòng được xét trước khi sang dòng sau; **`END`** là khối chạy khi kết thúc xử lý để xuất tổng. **`BEGIN`** là khối chạy trước khi đọc bản ghi, dùng chuẩn bị hoặc in tiêu đề. Nếu không ghi điều kiện, hành động trong `{...}` áp dụng cho mọi bản ghi.

Ví dụ quan sát trường:

```bash
awk '{print "line=" NR, "fields=" NF, "status=" $4}' access.log
```

`NR` là số bản ghi đã đọc tính trên luồng đầu vào; với một file và mỗi bản ghi một dòng, nó là số dòng. `NF` là số trường hiện tại. **Minh họa:** năm bản ghi đều có `fields=5`. Nếu đọc nhiều file, `NR` tiếp tục tăng; không mặc định nó là số dòng trong từng file.

Quy tắc chia trường và biến chuẩn được trình bày trong [GNU Awk: Default Field Splitting](https://www.gnu.org/s/gawk/manual/html_node/Default-Field-Splitting.html) và [GNU Awk: Input Summary](https://www.gnu.org/software/gawk/manual/html_node/Input-Summary.html).

### 5.2. Lọc status phải xét phạm vi và kiểu dữ liệu

```bash
awk '$4 >= 500 && $4 < 600 {print $0}' access.log
```

`&&` nghĩa là cả hai điều kiện đều đúng. Sau khi biết cột 4 là số status hợp lệ, điều kiện chọn đúng miền 500–599. **Minh họa:** lấy hai yêu cầu có status 500 và 503. Chỉ viết `$4 >= 500` không loại 700 nếu dữ liệu đầu vào không đúng schema.

`awk` có quy tắc chuyển giữa chuỗi và số theo ngữ cảnh. Không dựa vào phép so sánh để đồng thời xác minh một chuỗi là số hợp lệ. Dòng thiếu trường có thể cho trường rỗng; phép cộng có thể coi giá trị thiếu là 0, khiến báo cáo nhìn hợp lý nhưng sai. Trước tính toán, kiểm tra `NF`, mẫu của cột số và đơn vị. Lab mục 7.6 thực hiện việc đó.

### 5.3. Tại sao có thể đếm theo status mà chưa biết trước các mã?

```bash
awk '{count[$4]++} END {for (s in count) print s, count[s]}' access.log | sort -n
```

**Mảng kết hợp (associative array)** là nơi lưu giá trị theo khóa, không chỉ theo chỉ số số học. Ở đây khóa là status, như `"200"`, giá trị là số lần gặp. `count[$4]++` tăng số đếm của khóa hiện tại thêm 1; khóa mới bắt đầu từ giá trị số 0 khi tăng. `for (s in count)` duyệt các khóa có trong mảng.

Trên dữ liệu mẫu, sau hai dòng đầu `count[200]` là 2; đọc thêm ba dòng tạo khóa 500, 404, 503 mỗi khóa bằng 1. Khối `END` in tổng nhóm. Thứ tự duyệt mảng không được mặc định là tăng dần, nên đưa qua `sort -n` để có thứ tự số. Đây là sắp xếp **báo cáo**, không đổi file log gốc.

**Minh họa:**

```text
200 2
404 1
500 1
503 1
```

Tổng cột đếm là 5; nếu tổng không bằng số bản ghi hợp lệ, hãy kiểm tra bộ lọc, trường và dữ liệu bị loại. Với quá nhiều khóa khác nhau, mảng tiêu thụ bộ nhớ theo số khóa, không chỉ theo kích thước một dòng.

### 5.4. Trung bình và tỷ lệ có mẫu số nào?

```bash
awk '{sum += $5; n++} END {if (n) printf "mean_ms=%.1f\n", sum/n}' access.log
awk '{n++; if ($4 >= 500 && $4 < 600) errors++}
     END {if (n) printf "errors=%d total=%d rate=%.1f%%\n", errors, n, 100*errors/n}' access.log
```

`sum += $5` cộng thời gian vào tổng; `n++` đếm bản ghi. `if (n)` chỉ tính khi số bản ghi khác 0 để tránh chia cho 0. `printf` định dạng đầu ra: `%d` in số nguyên, `%.1f` in số với một chữ số sau dấu thập phân, `%%` in ký tự `%`, `\n` xuống dòng.

**Minh họa:** tổng thời gian là `12 + 2 + 93 + 4 + 110 = 221 ms`; trung bình `221/5 = 44.2 ms`. Có hai bản ghi 5xx nên tỷ lệ `2/5 × 100 = 40.0%`.

Mẫu số là **số yêu cầu**, không phải số IP duy nhất hay số mã status khác nhau. Trung bình không cho biết thời gian chậm nhất và có thể che một ít yêu cầu rất chậm; năm dòng mẫu cũng không cho phép kết luận chất lượng dịch vụ ngoài đời. Nếu lọc chỉ lỗi trước khi tính trung bình, bạn đang tính trung bình **của lỗi**, khác trung bình toàn bộ yêu cầu. Với file rỗng, hai lệnh trên không in giá trị; báo cáo thực tế nên nói rõ “không có bản ghi”, không tự gán tỷ lệ 0%.

## 6. Khi nào phải dùng parser thay vì tách chữ thủ công?

**Parser (bộ phân tích cú pháp)** là công cụ đọc dữ liệu theo quy tắc của định dạng và biến nó thành các giá trị có cấu trúc. Nó giúp phân biệt dấu phân cách với cùng ký tự nằm trong nội dung, xử lý dấu nháy, ký tự được bảo vệ và cấu trúc lồng nhau.

### 6.1. JSON và JSONL: chọn trường theo tên

**JSON** là định dạng có giá trị số, chuỗi, đúng/sai, `null`, danh sách và đối tượng. **Object (đối tượng)** lưu cặp tên–giá trị, ví dụ `{"status":500,"path":"/a b"}`. **Array (mảng/danh sách)** lưu các giá trị theo thứ tự, viết trong `[...]`. **`null`** biểu thị giá trị rỗng theo định dạng, không phải số 0 hay chuỗi rỗng. **JSONL** là cách lưu mỗi dòng một giá trị JSON hoàn chỉnh, thường một đối tượng cho mỗi sự kiện.

Khoảng trắng bên trong chuỗi `"/a b"` là dữ liệu, không chia trường. Các đối tượng có thể đổi thứ tự khóa mà giữ nguyên ý nghĩa. Regex tìm chữ `500` không phân biệt số status, chữ trong path hoặc giá trị trong một đối tượng lồng khác. Không dùng cách tách khoảng trắng của `awk` hay regex tự ghép làm bộ đọc JSON tổng quát.

`jq` là bộ xử lý JSON. Ví dụ:

```bash
jq -r 'select(.status >= 500 and .status < 600) | .path' access.jsonl
```

`.status` truy cập trường tên `status`, `select(...)` giữ đối tượng thỏa điều kiện, `.path` lấy đường dẫn. `-r` xuất giá trị chuỗi trực tiếp thay vì chuỗi JSON có dấu nháy. Dấu `|` nằm **trong nháy đơn** thuộc ngôn ngữ `jq`, truyền giá trị JSON giữa các bộ lọc; nó không phải pipe của shell.

Điều kiện trên giả định status tồn tại và là số. JSON hợp cú pháp vẫn có thể có `"status":"500"` hoặc thiếu trường; cần kiểm tra schema trước. Đầu ra `-r` còn có thể chứa ký tự xuống dòng từ nội dung chuỗi, nên không mặc định mỗi dòng đầu ra là một bản ghi nguyên vẹn. Lab dùng path không có xuống dòng. Xem [jq manual](https://jqlang.org/manual/).

### 6.2. CSV: dấu phẩy không luôn là ranh giới trường

**CSV** là họ định dạng bảng văn bản thường dùng dấu phẩy phân cách, nhưng có quy tắc dấu nháy và nhiều biến thể. Ví dụ:

```text
name,note
alice,"hello, Linux"
```

Dòng dữ liệu có hai trường: `alice` và `hello, Linux`. `cut -d, -f2` sẽ chỉ lấy `"hello`, vì nó không hiểu dấu phẩy nằm trong dấu nháy. Một trường CSV cũng có thể chứa xuống dòng, nên cách “mỗi dòng là một bản ghi” không luôn đúng.

Dùng thư viện CSV, chẳng hạn Python 3:

```python
import csv
with open('people.csv', encoding='utf-8', newline='') as source:
    for row in csv.DictReader(source):
        print(row['note'])
```

`DictReader` đọc dòng tiêu đề làm tên trường, trả mỗi bản ghi dưới dạng ánh xạ tên–giá trị. `newline=''` để thư viện CSV xử lý quy tắc xuống dòng; `encoding='utf-8'` chỉ đúng khi nguồn thực sự dùng UTF-8. Dữ liệu CSV thường được trả thành chuỗi; thư viện không tự bảo đảm cột thời gian là số hợp lệ hay bảng đủ cột. Vẫn phải xác định biến thể dấu phân cách, dấu nháy và kiểm tra schema. Xem [Python: csv](https://docs.python.org/3/library/csv.html).

**YAML** là định dạng cấu trúc thường dùng cho cấu hình, có quy tắc thụt lề, chuỗi và cấu trúc lồng. Nó cũng cần parser phù hợp, không phải cắt theo dấu `:` bất kỳ. Khi đọc nguồn không đáng tin bằng thư viện YAML, chọn chế độ chỉ nạp dữ liệu an toàn mà thư viện cung cấp, tránh cơ chế dựng đối tượng tùy ý. Ví dụ thư viện PyYAML cung cấp `safe_load` cho việc chỉ nạp dữ liệu; xem [PyYAML documentation](https://pyyaml.org/wiki/PyYAMLDocumentation) và [đặc tả YAML 1.2.2](https://yaml.org/spec/1.2.2/). Bài không yêu cầu cài thêm thư viện YAML.

## 7. Lab: xây báo cáo từ log có schema rõ

### 7.1. Chuẩn bị thư mục và xác nhận công cụ

Dùng Bash tương tác, không bật `set -e` vì có bước cố ý thất bại. Mọi thay đổi nằm trong thư mục mới; không dùng quyền quản trị:

```bash
printf 'Bash=%s\n' "$BASH_VERSION"
command -v awk grep sort uniq cut tr sed mktemp
mkdir -p "$HOME/linux-lab/text"
text_lab=$(mktemp -d "$HOME/linux-lab/text/run.XXXXXX")
cd "$text_lab"
pwd
```

`command -v` tìm công cụ mà shell sẽ gọi; nó xác nhận có lệnh, không bảo đảm công cụ là GNU hay hỗ trợ mọi tùy chọn. `mktemp -d` tạo thư mục riêng, `$(...)` lấy đường dẫn trả về vào biến `text_lab`. Chỉ tiếp tục khi tạo thư mục và `cd` thành công; `pwd` phải hiện dưới `linux-lab/text/run.…`.

Có thể xem `grep --version`, `sed --version`, `sort --version`; riêng `awk` tùy bản có thể dùng `awk --version` hoặc `awk -W version`. Thiết bị nhúng tối giản có thể thiếu các tùy chọn xem phiên bản này, hãy xem trợ giúp của chính công cụ.

### 7.2. Tạo bộ dữ liệu mẫu và kiểm tra trường

```bash
cat > access.log <<'LOG'
10.0.0.1 GET / 200 12
10.0.0.2 GET /health 200 2
10.0.0.1 POST /orders 500 93
10.0.0.3 GET /missing 404 4
10.0.0.2 GET /orders 503 110
LOG
awk '{print "line=" NR, "fields=" NF, "status=" $4, "ms=" $5}' access.log
```

`cat` ghi nội dung stdin ra stdout; `>` đưa stdout vào file mới. `<<'LOG'` là **here-document**, cách đưa đoạn văn bản nhiều dòng thành stdin đến dòng kết thúc `LOG`. Dấu nháy quanh tên kết thúc giữ nguyên nội dung, không cho shell thay biến trong đoạn ấy.

Kiểm tra năm dòng đều có `fields=5`, status và ms khớp bảng schema. Đây chỉ là kiểm tra số trường và xem giá trị, chưa xác minh chúng hợp lệ về kiểu hay ý nghĩa.

### 7.3. Lọc và đọc các yêu cầu 5xx

```bash
awk '$4 >= 500 && $4 < 600 {print $0}' access.log > errors-5xx.log
cat errors-5xx.log
grep -nF -- '/orders' access.log
```

**Minh họa:** file lỗi có dòng IP `10.0.0.1` với status 500, thời gian 93 ms và IP `10.0.0.2` với status 503, thời gian 110 ms. `grep` chọn hai dòng có `/orders`, tình cờ trùng nhóm lỗi trong mẫu này. Không suy ra mọi truy cập `/orders` đều lỗi; thử thêm một truy cập `/orders` status 200 để thấy hai tiêu chí khác nhau.

### 7.4. Lưu báo cáo theo status và IP, kiểm tra pipeline

```bash
(
    export LC_ALL=C
    set -o pipefail
    awk '{count[$4]++} END {for (s in count) print s, count[s]}' access.log |
        sort -n > status-counts.txt
    result=$?
    printf 'status_pipeline=%s\n' "$result"
    awk '{print $1}' access.log | sort | uniq -c | sort -nr > ip-counts.txt
    result=$?
    printf 'ip_pipeline=%s\n' "$result"
)
cat status-counts.txt
cat ip-counts.txt
```

`(...)` tạo **subshell**, môi trường shell con; tùy chọn và biến môi trường thay trong đó không đổi phiên làm việc bên ngoài. `export LC_ALL=C` truyền quy tắc C cho mọi công cụ chạy trong nhóm này. `pipefail` giúp lỗi của bước trước không bị trạng thái thành công của bước cuối che đi. Đây là xử lý dữ liệu mẫu ASCII, không sắp xếp tên tiếng Việt.

Mỗi pipeline dự kiến báo 0. `status-counts.txt` có các cặp `200 2`, `404 1`, `500 1`, `503 1`. `ip-counts.txt` có hai IP đếm 2 (`10.0.0.1`, `10.0.0.2`) và IP `10.0.0.3` đếm 1. Hai nhóm đồng hạng không biểu thị IP nào có ưu tiên; muốn thứ tự rõ ràng thì chỉ định thêm khóa phụ phù hợp.

Tự đối chiếu tổng số đếm mỗi báo cáo bằng 5. Chỉ kiểm tra tổng chưa đủ phát hiện IP bị lấy sai cột; hãy xem từng khóa. Sắp xếp IP ở đây chỉ để gom chuỗi giống nhau, không phải thứ tự địa chỉ mạng theo giá trị số.

### 7.5. Tính trung bình và tỷ lệ, kể cả file rỗng

```bash
awk '
    {sum += $5; n++; if ($4 >= 500 && $4 < 600) errors++}
    END {
        if (n == 0) {
            print "Khong co ban ghi"
        } else {
            printf "total=%d errors=%d mean_ms=%.1f rate=%.1f%%\n", n, errors, sum/n, 100*errors/n
        }
    }
' access.log > summary.txt
cat summary.txt
```

**Minh họa:** `total=5 errors=2 mean_ms=44.2 rate=40.0%`. Thử tạo file rỗng bằng `: > empty.log` rồi chạy lại cùng chương trình với tên `empty.log`: `:` là lệnh không làm việc gì, chuyển hướng của shell tạo file rỗng. Phải thấy thông báo không có bản ghi, không chia cho 0. Các phép tính này vẫn giả định bản ghi hợp lệ; bước tiếp theo loại giả định đó khỏi phần kiểm tra đầu vào.

### 7.6. Thêm dòng sai để thấy số đẹp vẫn có thể sai

```bash
cp -- access.log access-bad.log
printf '%s\n' '10.0.0.9 GET /broken 503' >> access-bad.log
awk '{sum += $5; n++} END {if (n) print sum/n}' access-bad.log
```

Dòng thêm chỉ có bốn trường, thiếu thời gian. Trong phép cộng này trường thiếu được dùng như 0; mẫu số lại tăng thành 6, cho kết quả minh họa khoảng `36.8333` thay vì 44.2. Công cụ có thể trả thành công vì câu lệnh đúng cú pháp, dù dữ liệu không thỏa schema.

Tạo chương trình kiểm tra riêng để chỉ tính sau khi xác nhận đầu vào:

```bash
cat > validate.awk <<'AWK'
{
    bad = (NF != 5 || $3 !~ /^\// ||
           $4 !~ /^[1-5][0-9][0-9]$/ || $5 !~ /^[0-9]+$/)
    if (bad) {
        printf "Invalid record at line %d: %s\n", NR, $0 > "/dev/stderr"
        invalid++
    }
}
END {
    if (invalid) exit 1
}
AWK
awk -f validate.awk access-bad.log 2> validation-errors.txt
validation_status=$?
printf 'validation_status=%s\n' "$validation_status"
cat validation-errors.txt
```

`-f` yêu cầu `awk` đọc chương trình từ file. `||` là “ít nhất một điều kiện đúng”, `!~` là “không khớp regex”. Chương trình từ chối sai số trường, path không bắt đầu `/`, status ngoài dạng 100–599 hoặc thời gian không phải số nguyên không âm. `/dev/stderr` là đường đặc biệt tới đầu ra lỗi trên môi trường Linux thông thường của bài; một hệ tối giản có thể không cung cấp nó. `exit 1` báo kiểm tra thất bại; không nhầm với quy ước status 1 riêng của `grep`.

**Minh họa:** status 1 và chẩn đoán nhắc dòng 6; không tính báo cáo cho file này. Dùng cổng kiểm tra trước bước tổng hợp:

```bash
if awk -f validate.awk access.log 2> validation-errors.txt; then
    awk '{sum += $5; n++}
         END {if (n) printf "mean_ms=%.1f\n", sum/n; else print "Khong co ban ghi"}' access.log
else
    printf 'Dung thong ke: dau vao sai schema\n' >&2
    cat validation-errors.txt >&2
fi
```

Với `access.log` hợp lệ, trung bình vẫn 44.2; thay tên nguồn ở **cả hai vị trí** thành `access-bad.log` để thấy thống kê bị dừng. Không dùng `awk kiểm-tra | sort` rồi tin vào báo cáo: bước sau có thể đã nhận dữ liệu một phần trước khi bước trước báo lỗi.

Giới hạn của bộ kiểm tra: nó không xác minh IP là địa chỉ hợp lệ, method thuộc danh sách cho phép, path là URL đúng hay giá trị ms hợp lý cho dịch vụ. Nó cố ý chấp nhận thời gian nguyên, nên log thật có `12.5` cần schema và bộ kiểm tra khác. File rỗng qua kiểm tra cấu trúc nhưng không có dữ liệu để tính. Quy trình hai lượt đọc giả định file lab không bị bên khác sửa giữa các lượt; với log đang ghi, cần phân tích một bản chụp nhất quán hoặc thiết kế xử lý một lượt có chính sách rõ ràng.

Bạn có thể chọn loại dòng sai rồi tính phần còn lại, nhưng phải báo số bị loại và nêu mẫu số là số **hợp lệ**. Không được âm thầm đổi chính sách từ “tất cả yêu cầu” sang “những dòng đọc được”.

### 7.7. Đổi cùng dữ liệu sang JSONL và dùng tên trường

Nếu `command -v jq` tìm thấy công cụ, xem `jq --version` rồi làm tiếp; các cú pháp bên dưới dùng tính năng phổ biến, không cần tùy chọn mới riêng của bản 1.8:

```bash
cat > access.jsonl <<'JSONL'
{"ip":"10.0.0.1","method":"GET","path":"/","status":200,"latency_ms":12}
{"ip":"10.0.0.2","method":"GET","path":"/health","status":200,"latency_ms":2}
{"ip":"10.0.0.1","method":"POST","path":"/orders","status":500,"latency_ms":93}
{"ip":"10.0.0.3","method":"GET","path":"/missing","status":404,"latency_ms":4}
{"ip":"10.0.0.2","method":"GET","path":"/orders","status":503,"latency_ms":110}
JSONL
jq -r 'select(.status >= 500 and .status < 600) | .path' access.jsonl
jq -s '
    if length == 0 then
        {total: 0, errors: 0, mean_ms: null, rate_percent: null}
    else
        length as $n |
        ([.[] | select(.status >= 500 and .status < 600)] | length) as $errors |
        {total: $n, errors: $errors,
         mean_ms: ((map(.latency_ms) | add) / $n),
         rate_percent: (100 * $errors / $n)}
    end
' access.jsonl > summary.json
cat summary.json
```

`-s` gom mọi giá trị đầu vào thành một mảng trước khi chạy bộ lọc. `length` đếm phần tử mảng, `.[]` lấy từng phần tử, `as $n` đặt tên cho số đếm để dùng lại. `map(.latency_ms)` lấy danh sách thời gian, `add` cộng chúng. Mảng không có phần tử được xử lý riêng bằng `null` cho trung bình và tỷ lệ chưa xác định.

**Minh họa:** lệnh lọc in `/orders` hai lần; báo cáo có `total` 5, `errors` 2, `mean_ms` 44.2 và `rate_percent` 40, không nhất thiết in phần thập phân `.0`. Đối chiếu cùng các phép tính ở lab văn bản. Đổi thứ tự khóa trong một đối tượng không làm phép lấy `.status` đổi ý nghĩa.

Để xác minh hai trường số dùng trong thống kê, chạy trước:

```bash
jq -e -s '
    all(.[];
        if type != "object" then false
        elif (.status | type) != "number" then false
        elif (.latency_ms | type) != "number" then false
        else (.status >= 100 and .status < 600 and .status == (.status | floor)
              and .latency_ms >= 0 and .latency_ms == (.latency_ms | floor))
        end)
' access.jsonl > json-validation.txt
json_validation_status=$?
printf 'json_validation_status=%s\n' "$json_validation_status"
cat json-validation.txt
```

`all` yêu cầu mọi phần tử thỏa điều kiện, `type` xem kiểu và `floor` làm tròn xuống để kiểm tra số nguyên. Các nhánh kiểm tra kiểu chạy trước so sánh số. `-e` làm trạng thái phụ thuộc kết quả kiểm tra đúng/sai; chỉ chấp nhận trạng thái 0, còn lỗi cú pháp hoặc trạng thái khác phải xem chẩn đoán. Đây là xác minh hai trường số, chưa phải toàn schema năm trường. `all` trên mảng rỗng cho `true`, nên vẫn cần xử lý báo cáo rỗng như trên.

Thử trên bản sao có status chuỗi `"500"`, thiếu `latency_ms` hoặc thời gian âm để thấy bộ kiểm tra từ chối. JSON hợp cú pháp không đồng nghĩa hợp schema. `-s` giữ cả dữ liệu trong bộ nhớ, thích hợp bộ mẫu nhỏ; không áp dụng mặc định cho log nhiều gigabyte. Trong tình huống thực tế, chỉ tổng hợp sau bước kiểm tra thành công và trên cùng dữ liệu không bị thay đổi.

### 7.8. Thực hành CSV để thấy parser khác `cut`

Nếu có Python 3:

```bash
cat > people.csv <<'CSV'
name,note
alice,"hello, Linux"
bob,"two words"
CSV
cut -d ',' -f 2 people.csv
python3 - <<'PY'
import csv
with open('people.csv', encoding='utf-8', newline='') as source:
    for row in csv.DictReader(source):
        print(row['note'])
PY
```

**Minh họa:** `cut` in cả tiêu đề `note` rồi cắt sai ghi chú của alice thành `"hello`; parser bỏ tiêu đề theo quy tắc `DictReader` và trả đúng `hello, Linux`, `two words`. Cách đọc này không bỏ dấu nháy tùy ý mà diễn giải chúng theo quy tắc CSV.

Giữ các file báo cáo, file kiểm tra và ghi lại vì sao bản malformed không được chấp nhận. Dùng `printf '%s\n' "$text_lab"` để biết thư mục đã lưu; không cần xóa lab để hoàn thành.

## 8. Gỡ lỗi: vì sao một lệnh đúng cú pháp vẫn cho kết quả lạ?

### 8.1. CRLF làm mẫu cuối dòng không khớp

**LF** là ký tự xuống dòng thường dùng trong file Linux. **CRLF** là cặp ký tự carriage return rồi line feed, thường gặp trong văn bản từ Windows. Khi đọc dòng kết thúc CRLF, một số công cụ vẫn giữ CR ở cuối nội dung; `200$` khi đó không khớp vì sau `200` còn CR.

```bash
printf '200\r\n500\r\n' > crlf.txt
sed -n l crlf.txt
grep -E '^200$' crlf.txt
result=$?
printf 'grep_status=%s\n' "$result"
sed 's/\r$//' crlf.txt > lf.txt
grep -E '^200$' lf.txt
```

Trong GNU `sed`, lệnh `l` hiển thị các ký tự khó thấy và đánh dấu cuối dòng bằng `$`. **Minh họa:** thấy `200\r$`, `500\r$`; grep đầu không khớp, sau bỏ CR cuối dòng thì khớp. `\r` ở mẫu `sed` này là cú pháp được GNU `sed` hỗ trợ, không mặc định mọi bản đều có cùng mở rộng.

Chỉ chuẩn hóa khi schema xác định CR là phần kết thúc dòng. `tr -d '\r'` xóa CR ở mọi vị trí, có thể làm mất dữ liệu có ý nghĩa; ví dụ này chỉ loại cuối dòng và ghi vào file khác. Đừng sửa bản gốc trước khi xem ký tự thực tế.

### 8.2. `rg` không thấy có nghĩa là toàn cây không có chuỗi đó?

`rg` là tên lệnh của ripgrep, công cụ tìm nội dung trong cây thư mục, thuận tiện với mã nguồn:

```bash
rg -n -F -- 'TODO' .
```

**Cây thư mục** là cấu trúc thư mục cha chứa các thư mục con và file. `.` chọn cây bắt đầu ở thư mục hiện tại. Mặc định ripgrep bỏ qua nhiều file theo quy tắc ignore, file ẩn và dữ liệu được nhận diện là nhị phân. **File ẩn** thường có tên bắt đầu bằng dấu chấm; **ignore** là quy tắc loại tên khỏi tìm kiếm, chẳng hạn trong `.gitignore`; **nhị phân** là dữ liệu không được xem như văn bản thông thường.

Để kiểm tra việc bỏ qua trong một thư mục lab nhỏ:

```bash
mkdir -p search-demo
printf 'TODO visible\n' > search-demo/visible.txt
printf 'TODO hidden\n' > search-demo/.hidden.txt
rg -n -F 'TODO' search-demo
rg --hidden --no-ignore -n -F 'TODO' search-demo
```

**Minh họa:** mặc định thấy file thường, lần sau thấy cả file ẩn. `--hidden` mở tìm file ẩn; `--no-ignore` bỏ qua quy tắc ignore. Chúng không tự bật theo liên kết tượng trưng hoặc đọc mọi dữ liệu nhị phân như văn bản. Phải xét thêm quyền đọc, phạm vi và tùy chọn khi yêu cầu “tìm toàn bộ”. Không chạy tìm mở rộng trên toàn hệ thống chỉ để kiểm chứng một thư mục nhỏ. Tham khảo [ripgrep User Guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md).

### 8.3. Dữ liệu lớn làm pipeline chậm hoặc đầy nơi lưu

**I/O (input/output, nhập/xuất)** là việc đọc hoặc ghi dữ liệu giữa chương trình và nơi lưu. `sort` có thể ghi các phần đã sắp vào file tạm rồi trộn lại khi không giữ toàn bộ trong bộ nhớ. Vì vậy đọc được nguồn chưa chứng minh đủ dung lượng tạm và đích để hoàn thành.

GNU `sort` có `-T` để chọn thư mục tạm, và dùng biến `TMPDIR` trong trường hợp phù hợp. Kiểm tra dung lượng bằng `df -h` tại nơi chứa dữ liệu và file tạm; `df` báo dung lượng filesystem, `-h` định dạng dễ đọc. **Filesystem** là lớp tổ chức file và vùng lưu, ví dụ ext4; nhiều thư mục có thể nằm trên các filesystem khác nhau nên một nơi còn trống không chứng minh mọi nơi đủ chỗ.

Các lệnh lọc dòng thường có thể xử lý lần lượt, nhưng `sort` cần tổ chức toàn tập, mảng đếm `awk` tăng theo số khóa và `jq -s` gom toàn đầu vào. Pipeline không tự bảo đảm dùng ít bộ nhớ. Trước khi chạy trên **production**, tức môi trường đang phục vụ người dùng thật, giới hạn phạm vi/thời gian log cần phân tích và thử trên bản sao nhỏ. Với luồng chưa kết thúc, `END`, trung bình cuối cùng và kết quả sắp xếp toàn tập có thể chưa bao giờ xuất hiện.

### 8.4. Sắp xếp hoặc làm sạch đã đổi câu hỏi ban đầu

`sort` đổi thứ tự dòng; báo cáo đếm không còn giữ thứ tự thời gian của sự kiện. `uniq` bỏ/gộp dòng theo cách dùng, không chứng minh đó là yêu cầu trùng do lỗi. Chuyển hoa/thường hoặc bỏ khoảng trắng có thể làm hai giá trị vốn khác nhau thành giống nhau.

Muốn biết yêu cầu diễn ra theo thứ tự nào, cần trường thời gian và quy tắc sắp phù hợp. Log mẫu không có timestamp (dấu thời gian), nên không cho biết lúc nào các yêu cầu xảy ra. Đừng suy ra tốc độ yêu cầu mỗi giây chỉ từ năm dòng và thời gian xử lý của từng dòng.

### 8.5. Lỗi đọc nguồn vẫn tạo được file báo cáo

Shell mở file đích của `>` trước khi công cụ đọc xong nguồn. Báo cáo có thể rỗng hoặc chứa một phần nếu nguồn/ghi đích lỗi. Kiểm tra exit status ngay, stderr và nội dung báo cáo. Khi cần thay báo cáo đang dùng, ghi file tạm và chỉ đổi tên sau khi toàn quy trình thành công như bài 08; việc ấy vẫn không tự bảo đảm dữ liệu bền vững khi mất điện.

## 9. Tự kiểm tra bằng tình huống mới

1. Một path chứa `/errors/500`, nhưng status là 200. Vì sao `grep '500'` không trả lời được “bao nhiêu lỗi server”?
2. Regex `5[0-9]{2}` có khớp bên trong `1500` không? Thêm gì để chỉ nhận chuỗi đúng ba chữ số?
3. `a*` có bắt buộc có chữ `a` không? `a+` thì sao trong ERE?
4. Dữ liệu `a, b, a` theo ba dòng được `uniq -c` đếm ra sao? Điều gì thay đổi nếu sắp trước?
5. Thêm `10.0.0.4 GET /ok 200 20` vào mẫu hợp lệ: tổng, số 5xx, trung bình và tỷ lệ mới là gì?
6. Thêm dòng thiếu latency: nên dừng, hay loại dòng rồi tính? Báo cáo cần nói rõ điều gì?
7. JSON có status `"500"` hợp cú pháp không? Có hợp schema yêu cầu số không?
8. `cut -d,` xử lý `"hello, Linux"` ra sao? Vì sao parser đọc khác?
9. `grep` trả 1, `awk` kiểm tra trả 1 và `rg` không thấy file ẩn có cho phép cùng một kết luận không?
10. Báo cáo có 5 bản ghi có đủ để tính yêu cầu mỗi giây không?

**Tiêu chí đối chiếu:**

- Câu 1–3: phân biệt vị trí trường với tìm đoạn chữ; regex không neo khớp đoạn trong `1500`, thêm `^` và `$`; `*` cho phép 0 lần, `+` yêu cầu ít nhất một lần.
- Câu 4: ba nhóm đếm 1 khi chưa sắp; sau sắp có `2 a`, `1 b`; nhận ra mất thứ tự sự kiện khi sắp.
- Câu 5: tổng 6, lỗi 2, tổng ms 241, trung bình khoảng 40.17 ms và tỷ lệ khoảng 33.33%; nếu làm tròn một chữ số thì 40.2 và 33.3%.
- Câu 6: chính sách phải rõ; nếu bỏ dòng, ghi số loại và mẫu số còn lại; không âm thầm coi dữ liệu thiếu là 0.
- Câu 7–8: đúng cú pháp khác đúng schema; parser hiểu kiểu số, dấu nháy và dấu phân cách nằm trong nội dung.
- Câu 9: ý nghĩa status phụ thuộc công cụ; phạm vi tìm và quy tắc bỏ qua cần kiểm tra riêng.
- Câu 10: thiếu khoảng thời gian quan sát; latency không thay thế được timestamp hay thời lượng thu thập.

## 10. Tóm tắt mô hình cần nhớ

Trước khi viết pipeline, xác định đơn vị bản ghi, schema và chính sách xử lý dữ liệu sai. Tìm chuỗi, kiểm tra trường và đọc cấu trúc là ba công việc có ranh giới khác nhau. `grep` chọn dòng, `sort` đưa giá trị cạnh nhau, `uniq` đếm nhóm, `awk` xử lý theo trường; parser đọc cấu trúc JSON/CSV theo quy tắc định dạng.

Một báo cáo đáng tin cần đúng dữ liệu, đúng phép biến đổi, đúng mẫu số và kiểm tra quá trình thực thi. Câu lệnh chạy thành công chưa chứng minh câu hỏi đã được trả lời đúng. Bài 10 sẽ học người dùng và quyền truy cập, giúp hiểu rõ hơn vì sao công cụ có thể đọc một file nhưng bị từ chối ở file khác.

## Tài liệu kiểm chứng và đọc tiếp

Tài liệu trực tuyến có thể mô tả bản mới hơn công cụ trên máy. Đối chiếu phiên bản và trợ giúp địa phương khi một tùy chọn không chạy:

- [GNU Grep manual](https://www.gnu.org/software/grep/manual/grep.html): chuỗi cố định, BRE/ERE và trạng thái kết thúc.
- [GNU sed manual](https://www.gnu.org/software/sed/manual/sed.html): vòng xử lý, lệnh thay thế, chọn/in dòng và xem ký tự khó thấy.
- [GNU Awk User’s Guide](https://www.gnu.org/software/gawk/manual/gawk.html): trường, điều kiện/hành động, mảng và tổng hợp; chú ý phần tính năng riêng của `gawk`.
- [GNU Coreutils manual](https://www.gnu.org/software/coreutils/manual/): `cut`, `tr`, `sort`, `uniq` và ảnh hưởng của locale.
- [ripgrep User Guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md): phạm vi tìm kiếm và quy tắc ignore.
- [jq manual](https://jqlang.org/manual/), [Python csv](https://docs.python.org/3/library/csv.html): đọc dữ liệu có cấu trúc.
- [RFC 9110, mục 15](https://www.rfc-editor.org/rfc/rfc9110.html#section-15): ý nghĩa nhóm mã HTTP.

`man` là công cụ mở hướng dẫn cài trên máy; dùng `man grep`, `man awk`, `man sed`, `man sort`. Nếu không có `man` trên hệ tối giản, đọc trợ giúp và tài liệu của đúng bản công cụ đang dùng.
