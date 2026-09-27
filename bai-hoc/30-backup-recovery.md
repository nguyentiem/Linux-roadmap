# Bài 30 — Backup, recovery và quản lý thay đổi

[Mục lục](../README.md) · [← Bài 29](29-observability.md) · [Bài 31 →](31-phuong-phap-hieu-nang.md)

## Mục tiêu: khi máy hỏng, bạn lấy lại dịch vụ bằng cách nào?

Giả sử dịch vụ nhận đơn hàng vẫn trả lời bình thường vào buổi sáng. Buổi chiều, một thay đổi cấu hình làm dịch vụ không khởi động; hoặc một thao tác nhầm xóa bảng đơn hàng. Cài lại chương trình có thể giải quyết tình huống đầu, nhưng không tự tạo lại dữ liệu đã mất trong tình huống sau. Bài này nối dữ liệu, bản sao và quy trình thay đổi thành một đường phục hồi có thể kiểm chứng.

Sau bài này, bạn cần xác định phạm vi bản sao, chọn điểm dữ liệu có thể phục hồi, khôi phục vào đích độc lập, kiểm tra dữ liệu và dịch vụ, đo phần mất dữ liệu/thời gian phục hồi, viết kế hoạch quay lại một phiên bản trước. Cần nền tảng bài 13, 22, 29; mỗi thuật ngữ quan trọng vẫn được nhắc tại đây. Lab bắt buộc chỉ dùng Bash, Python 3 và công cụ GNU `tar`, `sha256sum`, `diff` với dữ liệu giả trong thư mục riêng. Lab PostgreSQL là nhánh tùy chọn trên máy thử nghiệm đã chuẩn bị database riêng.

## 1. Bản sao, khôi phục và quay lại phiên bản khác nhau thế nào?

**File — tệp** chứa dữ liệu có tên trong hệ thống lưu trữ; ví dụ `orders.txt` lưu danh sách đơn. **Directory — thư mục** tổ chức các tên tệp, như `source/`. **Ứng dụng** là chương trình dùng dữ liệu để thực hiện công việc; **service — dịch vụ** là chương trình cung cấp chức năng đang hoạt động, như nhận yêu cầu đặt hàng. Khôi phục một tệp và khôi phục cả dịch vụ là hai phạm vi khác nhau.

**Backup — bản sao lưu** giữ dữ liệu để có thể lấy lại sau mất mát hoặc hỏng. Phải nói bản sao của cái gì, tại thời điểm nào, lưu ở đâu, ai có thể đọc/xóa nó. **Restore — thao tác khôi phục** dựng lại dữ liệu từ bản sao vào một đích. **Recovery — phục hồi khả năng hoạt động** rộng hơn: có thể gồm dựng máy, lấy khóa, restore, cấu hình, khởi động và xác nhận chức năng nghiệp vụ.

**Rollback — quay lại trạng thái trước một thay đổi** là quy trình đưa những thành phần được chỉ định về phiên bản/trạng thái trước. **Release — phiên bản phát hành** là bộ phần mềm và cấu hình đưa vào sử dụng. Nếu release mới chỉ sai cấu hình, rollback cấu hình có thể đủ. Nếu release mới đã đổi dữ liệu, thay file chương trình cũ chưa chắc đọc được dữ liệu mới.

```text
Dữ liệu nguồn tại điểm A ── tạo bản sao ──> kho bản sao + thông tin điểm A
                                                |
                                                v
                                    restore vào đích độc lập
                                                |
                                                v
                             kiểm tra dữ liệu + cấu hình + phụ thuộc
                                                |
                                                v
                               chạy dịch vụ và kiểm tra nghiệp vụ
```

Đọc từ hàng đầu xuống: bản sao là đầu vào cho restore; restore là một bước trong recovery. Mũi tên cuối đòi hỏi chương trình thực sự đọc được dữ liệu đúng. Ví dụ `tar` giải nén thành công nhưng thiếu mật khẩu kết nối database thì dịch vụ vẫn chưa phục hồi.

**Dependency — thành phần phụ thuộc** là thứ dịch vụ cần để hoạt động, chẳng hạn database, **DNS — cơ chế tra cứu tên máy/thông tin tên miền** — hoặc **chứng thư — dữ liệu gắn danh tính máy với khóa công khai để bên kết nối xác minh**. DNS giúp tìm địa chỉ từ tên; chứng thư có thể cần để client chấp nhận kết nối **HTTPS — trao đổi web HTTP qua TLS**. HTTP quy định yêu cầu/phản hồi web; TLS bảo vệ kết nối bằng cơ chế mã hóa và xác minh danh tính theo cấu hình. **Database — cơ sở dữ liệu** tổ chức dữ liệu và điều khiển truy cập/cập nhật, ví dụ bảng đơn hàng trong PostgreSQL. Vì vậy danh sách phục hồi phải chứa phần mềm, cấu hình, dữ liệu, thông tin kết nối và các phụ thuộc cần thiết; đừng chỉ liệt kê thư mục chứa chương trình.

## 2. Chấp nhận mất bao nhiêu dữ liệu và dừng bao lâu?

**RPO — Recovery Point Objective**, mục tiêu điểm phục hồi, là mức mất dữ liệu theo thời gian mà nghiệp vụ chấp nhận. **RTO — Recovery Time Objective**, mục tiêu thời gian phục hồi, là khoảng dừng cho phép trước khi chức năng đã định hoạt động trở lại. Hai mục tiêu này là yêu cầu, không phải số liệu tự có từ lịch backup.

Ví dụ minh họa: sự cố lúc 10:00, điểm dữ liệu mới nhất có thể phục hồi là 09:45; phần dữ liệu sau điểm đó không có trong đường phục hồi đang dùng. Khoảng cách điểm dữ liệu là 15 phút. Nếu mục tiêu RPO là 5 phút thì không đạt, dù **job backup — một lần chạy tác vụ sao lưu** gần nhất đã báo thành công. Nếu dịch vụ hoạt động đúng trở lại lúc 10:40 và mốc bắt đầu tính là 10:00, thời gian gián đoạn là 40 phút; với RTO 30 phút thì cũng không đạt.

```text
09:45                    10:00                       10:40
điểm dữ liệu phục hồi     sự cố                       dịch vụ dùng được
  |<-- 15 phút dữ liệu -->|<---- 40 phút phục hồi ---->|
```

Mũi tên trái nói phần thời gian dữ liệu không được phục hồi; mũi tên phải nói thời gian dịch vụ mất khả năng sử dụng. Phải thống nhất mốc đo: từ sự cố hay từ lúc tuyên bố sự cố, phục hồi toàn dịch vụ hay một chức năng tối thiểu. Trong bài dùng từ sự cố đến chức năng đã định phục hồi; nếu lab chỉ đo restore, hãy gọi đúng là thời gian restore.

**Recovery point — điểm phục hồi** là trạng thái dữ liệu mà bộ bản sao và nhật ký đủ điều kiện dựng lại. Lịch backup mỗi 5 phút chưa chắc đảm bảo RPO 5 phút: một lần lỗi, dữ liệu chưa nhất quán hoặc bản sao chưa đến kho độc lập đều có thể làm điểm dùng được cũ hơn. Tự kiểm tra bằng diễn tập chọn bản sao, dựng lại và xác định bản ghi cuối thực sự có mặt.

## 3. Vì sao copy các file đang chạy có thể tạo bản sao sai?

**Filesystem — hệ thống tệp** tổ chức tên, nội dung và thông tin tệp trên lưu trữ; nó không tự biết “đơn hàng phải khớp số dư” của ứng dụng. **Transaction — giao dịch** là nhóm cập nhật được database quản lý như một đơn vị theo các tính chất mà hệ đó cung cấp. Ví dụ giảm hàng tồn và ghi đơn cần được xử lý nhất quán theo nghiệp vụ.

Một ứng dụng cập nhật hai file: `orders.txt` rồi `stock.txt`. Nếu copy file thứ nhất trước cập nhật và file thứ hai sau cập nhật, bản sao có thể chứa trạng thái chưa từng cùng tồn tại. Copy từng file đều thành công vẫn không chứng minh bộ dữ liệu đúng.

**Snapshot — ảnh chụp trạng thái** ghi nhận một điểm của lớp lưu trữ theo cơ chế sản phẩm. **Crash-consistent — nhất quán như sau sự cố mất điện** chỉ cho ứng dụng một trạng thái tương tự lúc bị dừng đột ngột; ứng dụng có thể cần chạy cơ chế phục hồi riêng. **Application-consistent — nhất quán theo ứng dụng** sử dụng giao thức backup hoặc phối hợp với ứng dụng để tạo bộ dữ liệu hợp lệ. Snapshot nhiều volume cần phối hợp nếu dữ liệu trải trên nhiều nơi; chụp từng volume ở thời điểm khác nhau không tự có tính nhất quán chung.

Với dữ liệu tĩnh, không ai ghi trong suốt lúc lập manifest và đóng gói, lab `tar` dưới đây có phạm vi rõ. Với database đang chạy, dùng phương pháp được database hỗ trợ. PostgreSQL mô tả các điều kiện riêng của backup cấp filesystem, gồm dừng server hoặc snapshot nhất quán đầy đủ theo phương án hỗ trợ; không lấy việc `cp` hoàn tất làm chứng cứ backup hợp lệ. [PostgreSQL: backup cấp filesystem](https://www.postgresql.org/docs/current/backup-file.html).

**Giới hạn của việc tạm dừng ghi:** phải biết tất cả bên ghi, kể cả tác vụ chạy nền và dịch vụ khác. Dừng một giao diện web chưa chứng minh database hết cập nhật. Kiểm tra quy trình ứng dụng, và xác nhận phục hồi trên đích thử nghiệm thay vì đoán từ tên phương pháp.

## 4. Full, incremental và retention ảnh hưởng đường phục hồi thế nào?

**Full backup — bản sao đầy đủ** chứa toàn bộ phạm vi dữ liệu đã chọn tại điểm đó. **Incremental backup — bản sao gia tăng** ghi phần thay đổi theo mốc/bản trước mà công cụ quy định. **Differential backup — bản sao chênh lệch từ bản đầy đủ** thường chứa thay đổi từ full gần nhất. Các sản phẩm có thể tổ chức lưu trữ bên trong khác nhau; phải đọc cách phục hồi của đúng công cụ.

Ví dụ mô hình chuỗi đơn giản:

```text
Full thứ Hai → incremental thứ Ba → incremental thứ Tư → điểm thứ Tư
```

Muốn dựng điểm thứ Tư trong mô hình này cần full và các mắt xích liên quan. Mất mắt xích thứ Ba có thể làm điểm thứ Tư không dùng được, dù file thứ Tư còn nguyên. Bản gia tăng nhỏ hơn không có nghĩa phục hồi nhanh hơn; phải tính việc lấy và áp dụng đủ chuỗi. GNU `tar` có cơ chế gia tăng riêng với file trạng thái và cách extract riêng; lab này dùng full thường, không trộn các archive gia tăng như những file tar độc lập. [GNU tar: backup gia tăng](https://www.gnu.org/software/tar/manual/html_node/Incremental-Dumps.html).

**Retention — thời hạn/chính sách giữ bản sao** quy định giữ những điểm nào và xóa khi nào. Nếu dữ liệu hỏng âm thầm từ đầu tháng nhưng cuối tháng mới phát hiện, chỉ giữ bảy ngày có thể còn toàn bản đã hỏng. Ngoài lịch sử cần giữ, tính cả lượng dữ liệu mới/thay đổi mỗi ngày, dung lượng kho và quy định lưu giữ của nghiệp vụ áp dụng; số ngày giữ phải phù hợp với các điều kiện ấy. Khi xóa cần giữ nguyên phụ thuộc phục hồi, không xóa full chỉ vì incremental mới hơn vẫn tồn tại.

**Failure domain — phạm vi có thể hỏng cùng nhau** là nhóm tài nguyên cùng chịu một sự cố: một ổ, một máy, một tài khoản quản trị hoặc một vùng hạ tầng. **Replication — sao chép liên tục giữa các nơi** giúp giảm gián đoạn một số lỗi, nhưng xóa nhầm có thể được sao chép sang máy kia. **RAID — ghép nhiều ổ theo cơ chế phân bố/dự phòng** có thể giữ hệ hoạt động khi một số ổ hỏng; nó không tự giữ lịch sử trước khi người dùng xóa dữ liệu.

Do đó cần bản sao ngoài phạm vi hỏng muốn chống, đủ lịch sử và đủ kiểm soát truy cập. Snapshot cùng máy hữu ích để quay nhanh trước thay đổi, nhưng mất máy có thể mất cả snapshot. Một kho khác mà cùng quyền quản trị có thể vẫn bị xóa bởi cùng tài khoản bị chiếm; hãy thiết kế quyền xóa và cơ chế bảo vệ theo công cụ, rồi diễn tập cả việc truy xuất bản sao.

**Encryption — mã hóa** biến dữ liệu thành dạng cần khóa để đọc. **Key — khóa giải mã** là thông tin cho phép lấy lại nội dung; mất khóa có thể khiến bản sao còn đủ byte nhưng không dùng được. Kế hoạch phải nêu nơi lấy khóa, quyền lấy và quy trình kiểm tra. Không đặt khóa chỉ trong chính máy cần phục hồi.

## 5. Lab bắt buộc: tạo bản sao và restore vào nơi riêng

### 5.1. Tạo môi trường không đè dữ liệu cũ

**Shell — trình nhận lệnh** như Bash chạy các công cụ; **archive — tệp đóng gói** chứa nhiều tệp và thông tin liên quan. `tar` đóng gói; `gzip` nén để giảm kích thước. Đuôi `.tar.gz` là quy ước tên, không tự chứng minh định dạng hay bản sao hợp lệ.

Chạy các khối trong **cùng phiên Bash**, với dữ liệu tự tạo. `mktemp -d` tạo thư mục mới có tên riêng; không dùng nguồn thật. Không cần `sudo` — chạy lệnh với quyền quản trị — trong lab này.

```bash
lab_recovery=$(mktemp -d "${TMPDIR:-/tmp}/linux-recovery.XXXXXX")
printf 'Thu muc lab: %s\n' "$lab_recovery"
cd "$lab_recovery" || exit 1
mkdir source
printf 'order-001\n' > source/orders.txt
printf 'release=1\n' > source/config.txt
(cd source && sha256sum config.txt orders.txt) > manifest.sha256
tar -czf backup.tar.gz -C source .
tar -tzf backup.tar.gz
```

`$lab_recovery` giữ đường dẫn lab; `cd ... || exit 1` không tiếp tục nếu đổi thư mục lỗi. `>` ghi file của lab, ghi đè nếu đã có tên đó; thư mục mới tránh ảnh hưởng lần trước. `tar -c` tạo, `-z` nén gzip, `-f` chọn archive; `-C source` đổi nơi đọc nguồn trước khi lấy `.`. Archive và manifest nằm ngoài nguồn nên không tự chui vào bản sao. `-t` liệt kê, chưa khôi phục.

**Checksum — giá trị kiểm tra nội dung** được tính từ byte. `sha256sum` dùng SHA-256 để tạo dấu kiểm tra; **manifest — danh sách mô tả** ở đây ghi checksum và tên hai tệp cần đối chiếu. Nguồn phải giữ tĩnh từ lúc tính checksum đến lúc đóng gói. Tên fixture cố định, không có ký tự xuống dòng; với tên bất kỳ, phải dùng định dạng tên và quy trình kiểm chứng mà công cụ hỗ trợ, không tùy tiện ghép dòng bằng shell.

Đầu ra liệt kê **minh họa** gồm `./`, `./config.txt`, `./orders.txt`; thứ tự có thể khác. File tồn tại và `tar -t` đọc được mới cho biết archive có thể đọc/liệt kê, chưa chứng minh nội dung đúng hay dịch vụ hoạt động.

### 5.2. Khôi phục và đối chiếu

```bash
mkdir restore
python3 - <<'PY'
import subprocess
import time
start = time.monotonic()
subprocess.run(['tar', '-xzf', 'backup.tar.gz', '-C', 'restore'], check=True)
subprocess.run(['sha256sum', '-c', '../manifest.sha256'], cwd='restore', check=True)
subprocess.run(['diff', '-r', 'source', 'restore'], check=True)
print('restore_va_kiem_tra_giay=%.6f' % (time.monotonic() - start))
PY
cat restore/orders.txt
cat restore/config.txt
```

`tar -x` extract — lấy nội dung ra — vào thư mục đích mới. Chỉ dùng archive do chính lab tạo; nội dung và đường dẫn trong archive khác cần được kiểm tra trước khi extract vào nơi có dữ liệu. Python dùng **monotonic clock — đồng hồ đo khoảng không nhảy khi chỉnh ngày giờ** để đo giải nén và kiểm tra. `check=True` làm dừng nếu một lệnh báo lỗi; không in thời gian “thành công” sau một bước thất bại.

Cách đọc kết quả:

- `config.txt: OK` và `orders.txt: OK`: hai checksum khớp manifest; đây là điều cần nhìn, không chỉ mã thoát của `tar`.
- `diff -r` không in gì và thành công: nội dung/cấu trúc được `diff` so ở hai cây không có khác biệt. Lệnh này không xác nhận mọi metadata như quyền, chủ sở hữu hoặc ACL đã khớp.
- `restore_va_kiem_tra_giay=...`: thời gian đoạn lab đã ghi; không phải RTO của dịch vụ gồm dựng máy, khóa, mạng và nghiệp vụ.
- `cat` cho thấy `order-001`, `release=1`: kiểm tra ý nghĩa fixture. Với ứng dụng thật cần truy vấn/đọc qua ứng dụng và kiểm tra các bất biến nghiệp vụ.

**Metadata — thông tin mô tả tệp**, ví dụ quyền/chủ sở hữu/thời gian, có thể cần để ứng dụng hoạt động. **ACL — danh sách quyền bổ sung** và **extended attributes — thuộc tính mở rộng** có thể chứa thông tin quan trọng; archive mặc định và quyền người restore không tự bảo toàn tất cả trên mọi hệ. Nếu dữ liệu thật cần chúng, chọn tùy chọn công cụ, filesystem đích và kiểm tra sau restore phù hợp. Lab chỉ cam kết kiểm tra hai nội dung fixture.

Checksum tự tính không tự chứng minh bản sao có nguồn đáng tin: ai thay được cả archive và manifest có thể thay cả hai. Lưu/kiểm soát manifest theo yêu cầu chống sửa dữ liệu; với mục tiêu lab, nó dùng để phát hiện khác nội dung, không đóng vai trò chữ ký xác thực.

### 5.3. Tạo dữ liệu sau backup và thấy điểm phục hồi

```bash
printf 'order-002\n' >> source/orders.txt
mkdir restore_after
tar -xzf backup.tar.gz -C restore_after
printf 'Nguon hien tai:\n'
cat source/orders.txt
printf 'Ban phuc hoi:\n'
cat restore_after/orders.txt
if diff -r source restore_after; then
    printf 'Khong thay khac biet: kiem tra lai buoc tao order-002\n'
else
    lab_diff_status=$?
    printf 'diff status=%s\n' "$lab_diff_status"
fi
```

`>>` thêm dòng vào nguồn. Nguồn có hai đơn, bản phục hồi có một đơn vì archive không chứa cập nhật sau điểm backup. `diff` status 1 là có khác biệt, phù hợp thí nghiệm; status 2 là lỗi đọc/so sánh cần xử lý. Đừng coi mọi mã khác 0 là cùng một loại thất bại.

Đây là mô phỏng mất một bản ghi sau điểm sao lưu; chưa đo RPO theo phút vì fixture không chứa thời điểm ghi đáng tin. Để đo trên ứng dụng thử, ghi mốc sự cố và mốc giao dịch cuối được phục hồi, kiểm tra khoảng cách và so với mục tiêu đã đặt.

### 5.4. Chủ động làm hỏng đích thử và phát hiện

```bash
printf 'noi dung sai\n' > restore/config.txt
if (cd restore && sha256sum -c ../manifest.sha256); then
    printf 'Bat ngo: kiem tra lai file da sua\n'
else
    printf 'Da phat hien checksum khong khop; chua chap nhan ban restore nay\n'
fi
```

Một dòng `FAILED` cho `config.txt` là dấu phát hiện đúng; `orders.txt` vẫn có thể `OK`. Điều này cho thấy bản phục hồi phải được kiểm tra trước khi đưa vào sử dụng. Cách chữa lab là tạo **đích mới** rồi extract lại archive gốc và chạy đủ phép kiểm tra; không chỉnh checksum để ép hiện `OK`.

Giữ thư mục để nộp kết quả. Sau khi không cần nữa, kiểm tra đường dẫn in ở bước đầu rồi xóa **đúng thư mục lab ấy** bằng công cụ bạn quen dùng; không có bước tự động xóa nguồn thật trong bài.

## 6. Nhánh database: vì sao pg_dump khác tar một thư mục?

### 6.1. Chọn phương pháp theo mục tiêu

**Logical backup — sao lưu mức logic** xuất các cấu trúc và dữ liệu theo giao diện database, ví dụ câu lệnh tạo bảng và các hàng. **Physical backup — sao lưu mức vật lý** giữ bộ dữ liệu ở dạng lưu trữ của database theo giao thức được hỗ trợ. Hai cách có phạm vi, yêu cầu phiên bản và đường phục hồi khác nhau.

**SQL — ngôn ngữ truy vấn/cập nhật dữ liệu quan hệ** cho phép đọc và sửa bảng. **Schema — cấu trúc dữ liệu** ở đây là định nghĩa bảng/cột/ràng buộc của ứng dụng; trong PostgreSQL từ schema còn chỉ không gian tên chứa các đối tượng. Khi viết kế hoạch phải nói nghĩa đang dùng.

PostgreSQL cung cấp `pg_dump` để tạo bản xuất nhất quán của một database trong khi có cập nhật đồng thời theo cơ chế của nó. Nó không sao lưu tất cả đối tượng chung của toàn **cluster — cụm database do một server PostgreSQL quản lý**, chẳng hạn các role; cần kế hoạch riêng cho phạm vi chung. **Role — danh tính/quyền trong database** không đồng nhất với user Linux. [Tài liệu pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

Bảng dưới giúp chọn đúng công cụ đọc bản sao:

| Định dạng/phương pháp | Cách phục hồi thông thường | Giới hạn cần nhớ |
|---|---|---|
| `pg_dump` SQL thuần | `psql` đọc script SQL | Phải dừng/báo lỗi phù hợp, chuẩn bị đối tượng chung và môi trường |
| `pg_dump -Fc` custom archive | `pg_restore` | Không phải file SQL để đưa thẳng vào `psql`; cần công cụ tương thích |
| Base backup vật lý + chuỗi WAL | Quy trình recovery của server | Phải có đầy đủ thành phần và cấu hình, không dùng `pg_restore` cho thư mục data |

**WAL — Write-Ahead Log**, nhật ký ghi trước, ghi thông tin thay đổi theo giao thức database để hỗ trợ phục hồi. **Base backup — bản nền** là điểm bắt đầu vật lý cho việc áp dụng nhật ký. **PITR — Point-In-Time Recovery**, phục hồi đến một thời điểm được chọn, cần bản nền và WAL phù hợp/đầy đủ cùng quy trình cấu hình. Một file dump logic đơn lẻ không cho phép tùy ý phục hồi đến từng giây sau lúc dump. [PostgreSQL: continuous archiving và PITR](https://www.postgresql.org/docs/current/continuous-archiving.html).

Chọn manual đúng phiên bản server và bộ công cụ. `pg_dump` không đọc server thuộc major mới hơn nó; khả năng đọc bản cũ có phạm vi hỗ trợ được manual nêu. **Major version — thế hệ phiên bản lớn** có thể đổi định dạng/hành vi tương thích. `pg_dump --version` là phiên bản công cụ, còn `SHOW server_version` hỏi server thực kết nối; không được thay lẫn nhau. Nhánh lab dùng công cụ cùng major với server để giảm biến số.

### 6.2. Lab tùy chọn trên PostgreSQL thử nghiệm

Chỉ làm nếu đã có PostgreSQL thử nghiệm, các công cụ `psql`, `createdb`, `pg_dump`, `pg_restore` và danh tính có quyền tạo database. Những lệnh sau tạo **hai database mới**, không thao tác database thật. Nếu một tên đã tồn tại, dừng và chọn tên riêng; không `drop` database đó để làm theo bài. Các biến kết nối `PGHOST`, `PGPORT`, `PGUSER` nếu cần phải chỉ đúng server thử nghiệm, không mặc định rằng kết nối local là an toàn.

**Credential — thông tin xác thực**, như mật khẩu, phải được cung cấp theo cơ chế bảo vệ phù hợp; đừng đưa mật khẩu vào command line hoặc bài nộp. File `.pgpass` trên Unix cần quyền 0600 để được sử dụng theo quy tắc libpq; chỉ dùng fixture kết nối của bạn và giữ bí mật. [PostgreSQL password file](https://www.postgresql.org/docs/current/libpq-pgpass.html).

```bash
pg_dump --version
pg_restore --version
psql -X -v ON_ERROR_STOP=1 -d postgres -c 'SHOW server_version;'
createdb linux_recovery_source
createdb linux_recovery_restored
```

Chạy từng bước, dừng ngay nếu lỗi. `-X` bỏ cấu hình cá nhân `psqlrc` để giảm ảnh hưởng ngoài bài; `ON_ERROR_STOP=1` yêu cầu dừng khi lỗi SQL. `postgres` ở đây là database quản trị dùng để hỏi phiên bản; môi trường có thể cung cấp tên khác.

Tạo hai đơn trong database nguồn:

```bash
psql -X -v ON_ERROR_STOP=1 -d linux_recovery_source <<'SQL'
CREATE TABLE orders (
    id integer PRIMARY KEY,
    amount integer NOT NULL CHECK (amount >= 0)
);
INSERT INTO orders VALUES (1, 100), (2, 250);
SELECT count(*) AS orders, sum(amount) AS total FROM orders;
SQL
```

**Primary key — khóa chính** xác định mỗi hàng không trùng theo cột `id`. **Constraint — ràng buộc** là quy tắc database kiểm tra, như số tiền không âm. Kết quả minh họa là `orders=2`, `total=350`; kiểm tra cả tổng tiền có ích hơn chỉ thấy bảng tồn tại.

Trong thư mục lab riêng đã tạo ở mục 5:

```bash
pg_dump -Fc -f orders.dump linux_recovery_source
pg_restore --list orders.dump
pg_restore --exit-on-error --single-transaction \
    --no-owner --no-privileges -d linux_recovery_restored orders.dump
psql -X -v ON_ERROR_STOP=1 -d linux_recovery_restored \
    -c 'SELECT count(*) AS orders, sum(amount) AS total FROM orders;'
```

`--list` đọc danh mục archive, không restore. `--exit-on-error` yêu cầu báo dừng khi lỗi; `--single-transaction` gom restore thành một giao dịch trong phạm vi công cụ hỗ trợ, giúp tránh một phần nội dung đã áp dụng khi lỗi. `--no-owner --no-privileges` bỏ phục hồi chủ sở hữu và quyền từ nguồn để đơn giản hóa lab dùng một danh tính; **đây là thay đổi phạm vi**, không phải cách giữ nguyên quyền của hệ thật. Sau restore hệ thật phải dựng đúng role/quyền và xác nhận ứng dụng với đúng danh tính. [Tài liệu pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).

Tiêu chí lab là truy vấn đích trả hai đơn/tổng 350, không có lỗi restore, và dữ liệu nguồn không bị sửa. Thêm đơn thứ ba ở nguồn sau dump rồi truy vấn cả hai để thấy điểm dữ liệu khác nhau. Đích đã có đối tượng khi chạy lại có thể báo lỗi “already exists”; dùng database đích mới. Không thêm `--clean` chỉ để bỏ qua việc đích đang chứa dữ liệu cần giữ.

Giữ hai database để đối chiếu. Khi không cần nữa, chỉ khi đã xác nhận cả hai được tạo thành công bởi lần lab này, đúng server thử nghiệm và không chứa dữ liệu cần giữ, có thể dọn bằng `dropdb linux_recovery_restored` rồi `dropdb linux_recovery_source`. `dropdb` xóa database và dữ liệu bên trong, không phải ngắt kết nối tạm; không dùng bước này cho một tên đã tồn tại trước lab. Giữ nguyên cấu hình kết nối và kiểm tra danh sách bằng `psql -X -d postgres -c "\\l"` trước/sau. Nếu không chắc nguồn gốc, giữ lại để kiểm tra thay vì xóa.

Lab này không thử PITR, dữ liệu lớn, mở rộng nhiều database, quyền thật, phần mở rộng hoặc phục hồi trên server bị mất. Không suy ra chiến lược cho hệ phục vụ thật từ vài hàng; cần quy trình chính thức theo phiên bản, tải, RPO/RTO và diễn tập đầy đủ.

## 7. Thay đổi dịch vụ thế nào để có đường quay lại rõ ràng?

**Runbook — hướng dẫn thao tác vận hành** ghi người làm, đầu vào, từng bước, tiêu chí và xử lý khi lỗi. **Artifact — sản phẩm phát hành** là thứ có thể lấy lại chính xác, như gói chương trình phiên bản cụ thể; “cài lại bản cũ” chưa đủ nếu không biết bản nào và kho nào còn giữ.

**Baseline — trạng thái mốc trước thay đổi** gồm phiên bản, cấu hình và kết quả kiểm tra đang được chấp nhận. **Health check — phép kiểm tra sức khỏe chức năng** phải nói đang kiểm tra gì, ví dụ yêu cầu đọc danh sách đơn thành công. Một process tồn tại không chứng minh chức năng đọc database đúng.

Một runbook cho dịch vụ đơn hàng nên trả lời theo thứ tự:

| Bước | Nội dung cần ghi | Bằng chứng để đi tiếp |
|---|---|---|
| Trước thay đổi | Phiên bản ứng dụng/config/cấu trúc dữ liệu, người phụ trách, phạm vi | Đã biết trạng thái đang hoạt động và đường quản trị dự phòng |
| Chuẩn bị recovery | Điểm backup, nơi lấy, khóa/quyền, quy trình restore | Đã thử khôi phục vào đích độc lập và kiểm tra nghiệp vụ |
| Áp dụng phạm vi nhỏ | Đích thử, phiên bản chính xác, thời gian quan sát | Các kiểm tra chức năng thành công |
| Quyết định mở rộng | Ngưỡng lỗi/độ trễ và điều kiện dừng | Số đo đúng phạm vi và đủ cửa sổ quan sát đã định |
| Khi dừng/rollback | Lệnh/artefact/cấu hình cụ thể, xử lý dữ liệu phát sinh | Phiên bản trước đọc được dữ liệu hiện tại hoặc có kế hoạch phục hồi được duyệt |
| Sau thay đổi | Kiểm tra lại chức năng, dữ liệu, log và người xác nhận | Dịch vụ đáp ứng tiêu chí, không chỉ lệnh triển khai có mã thoát 0 |

**Canary — triển khai thăm dò trên phạm vi nhỏ** đưa phiên bản mới đến một phần workload trước khi mở rộng. **Workload — lượng/cách công việc được hệ xử lý** cần đại diện cho hành vi muốn kiểm chứng. Với một VM lab, có thể thử trên bản sao độc lập; nó giúp phát hiện lỗi cơ bản nhưng không thay thế kiểm chứng tải thật.

**Error rate — tỷ lệ yêu cầu lỗi** và **latency — thời gian phản hồi** cần định nghĩa mẫu số, cửa sổ và điểm đo như bài 29. Ngưỡng minh họa “không có lỗi trong 20 yêu cầu đọc thử” dùng cho lab nhỏ, không phải điều kiện universal cho sản phẩm. Quyết định dừng phải ghi trước để tránh thấy lỗi rồi tùy ý đổi tiêu chí cho qua.

### 7.1. Vì sao rollback chương trình không tự rollback dữ liệu?

**Migration — chuyển đổi cấu trúc/dữ liệu** thay đổi cách ứng dụng lưu/đọc dữ liệu. Ví dụ bản mới đổi `amount` từ số nguyên sang cấu trúc khác và xóa cột cũ; bản cũ quay lại có thể không đọc được nữa. Restore bản sao trước thay đổi cũng có thể mất các đơn mới đã được nhận sau đó.

**Expand/contract — mở rộng trước, thu gọn sau** là cách tổ chức chuyển đổi để có giai đoạn tương thích: thêm trường mới, hỗ trợ giai đoạn hai cách đọc/ghi theo thiết kế, chuyển dữ liệu và xác nhận, chỉ xóa phần cũ khi không còn cần. Nó không là mẹo tự động áp dụng được cho mọi migration; logic ghi đôi, đồng bộ và kiểm tra phải được thiết kế theo ứng dụng.

Ví dụ an toàn để thảo luận: thêm cột mới cho tính năng chưa bắt buộc; phiên bản cũ vẫn dùng cột cũ, bản mới chịu được hàng chưa có dữ liệu mới. Sau khi toàn bộ dữ liệu được chuyển và không cần quay lại bản cũ mới xét bỏ cột cũ. Tự kiểm tra bằng chạy cả hai phiên bản với dữ liệu đại diện trong môi trường thử, không chỉ thấy migration kết thúc.

### 7.2. Bài tập runbook không cần triển khai lên hệ thật

Viết kế hoạch giả định release 1→2 cho dịch vụ đã làm ở bài 15/25. Ghi cấu hình/phiên bản trước, backup nào đã restore được, một yêu cầu đọc hợp lệ, ngưỡng dừng, thứ tự quay lại chương trình/cấu hình và cách xử lý đơn mới. Nếu chỉ sửa file tĩnh, nêu rõ không có migration database; nếu có đổi cấu trúc, chứng minh khả năng đọc của bản cũ hoặc giải thích vì sao cần recovery khác.

Bản kế hoạch phải đủ để một người khác biết lấy artefact ở đâu, chạy kiểm tra nào, nhìn dấu nào và khi nào dừng. Chưa diễn tập thì ghi “kế hoạch chưa diễn tập”; đừng ghi “rollback bảo đảm” vì đã có checklist.

## 8. Những lỗi thường gặp và cách kiểm tra lại

| Hiện tượng/suy luận | Điều cần kiểm tra |
|---|---|
| Job xanh nên backup tốt | Có đúng phạm vi? Bản sao có đến kho? Restore và kiểm tra nghiệp vụ đã chạy chưa? |
| Archive tồn tại nhưng checksum sai | Nguồn có đổi lúc backup? Archive/manifest có bị sửa? Đang dùng đúng cặp và đúng đích không? |
| Giải nén đúng nhưng dịch vụ không đọc | Quyền, chủ sở hữu, nhãn bảo mật, cấu hình, đường dẫn và phụ thuộc; thử bằng đúng danh tính dịch vụ |
| Backup mã hóa còn nguyên nhưng không đọc được | Khóa đúng, định dạng/công cụ đúng, người phục hồi có quyền và đường lấy khóa hoạt động không? |
| RPO tốt nhưng restore rất lâu | Thời gian lấy kho/chuỗi bản sao, băng thông, dung lượng, áp dụng nhật ký và kiểm tra; đo cả đường recovery |
| Replica cũng mất hàng vừa xóa | Xóa hợp lệ có thể được nhân bản; cần lịch sử backup/điểm PITR phù hợp |
| Quay lại file chương trình đã biên dịch nhưng vẫn lỗi | Cấu hình/dữ liệu đã đổi gì? Bản cũ có tương thích không? Đừng restore đè trước khi có phương án dữ liệu mới |
| Restore thử làm mất dữ liệu đang dùng | Đích không độc lập; dừng và thiết kế lại. Tên gần giống không chứng minh đúng máy/database |

**Permission — quyền truy cập** quyết định ai đọc/sửa dữ liệu; khi restore bằng user khác, nội dung có thể đúng nhưng quyền sai. **MAC — kiểm soát truy cập bắt buộc** như SELinux/AppArmor còn có chính sách riêng; kiểm tra bằng hướng dẫn bài 26. Không tăng quyền toàn bộ cây hoặc tắt bảo vệ để che lỗi phục hồi.

## 9. Tự kiểm tra và phần nộp lab

1. Backup mỗi 5 phút, nhưng hai lần gần nhất hỏng. RPO thực tế có chắc 5 phút? **Đối chiếu:** không; cần điểm mới nhất phục hồi được, không chỉ lịch.
2. `sha256sum -c` báo OK cho hai fixture. Có chứng minh ứng dụng chạy được? **Đối chiếu:** chỉ chứng minh nội dung được đối chiếu khớp, chưa kiểm tra phụ thuộc/quyền/nghiệp vụ.
3. Full thứ Hai bị xóa, incremental thứ Ba/Tư vẫn còn. Có chắc restore được thứ Tư? **Đối chiếu:** không; phải xét chuỗi phụ thuộc của công cụ.
4. Giải nén mất 2 giây, dựng máy và lấy khóa mất 40 phút. RTO 10 phút đã đạt? **Đối chiếu:** chưa, phải đo toàn chức năng phục hồi theo mốc thống nhất.
5. `pg_dump -Fc` có đưa thẳng vào `psql` không? **Đối chiếu:** dùng `pg_restore`; plain SQL mới là đầu vào script cho `psql`.
6. Release mới xóa cột mà bản cũ cần. Thay binary cũ có đủ rollback? **Đối chiếu:** không; cần thiết kế tương thích hoặc phương án dữ liệu, tính cả dữ liệu mới.
7. Bản sao ở máy khác nhưng khóa chỉ ở máy đã mất. Có đủ recovery? **Đối chiếu:** chưa; phải lấy được khóa và kiểm chứng giải mã.

Nộp đường dẫn lab, manifest, kết quả kiểm tra đích đầu tiên, khác biệt sau `order-002`, dấu phát hiện dữ liệu sai, thời gian **đoạn restore và kiểm tra** cùng phạm vi. Thêm một bảng RPO/RTO giả định có mốc và một runbook thay đổi release. Nhánh PostgreSQL nếu làm: ghi phiên bản client/server, format, kết quả truy vấn nguồn/đích và các phần chưa được backup. Không nộp mật khẩu/khóa.

**Tự nhắc lại:** bản sao phải dẫn đến điểm dữ liệu dùng được; restore phải dẫn đến dịch vụ dùng được. RPO nói phần dữ liệu mất, RTO nói thời gian dừng theo phạm vi đã chọn. Rollback cần cả phần mềm, cấu hình và tương thích dữ liệu. Bài 31 sẽ dùng phương pháp đo để tìm nguyên nhân hiệu năng thay vì đổi cấu hình theo cảm giác.

## Nguồn đối chiếu

- [GNU tar manual](https://www.gnu.org/software/tar/manual/tar.html), [backup gia tăng](https://www.gnu.org/software/tar/manual/html_node/Incremental-Dumps.html): đóng gói và phụ thuộc của quy trình phục hồi; đối chiếu với `tar --version`/`man tar` trên máy.
- [GNU sha256sum](https://www.gnu.org/software/coreutils/manual/html_node/sha2-utilities.html), [Python time](https://docs.python.org/3/library/time.html): kiểm tra byte và đo khoảng thời gian.
- [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html), [backup cấp filesystem](https://www.postgresql.org/docs/current/backup-file.html), [continuous archiving/PITR](https://www.postgresql.org/docs/current/continuous-archiving.html): chọn phương pháp và điều kiện nhất quán. Đường dẫn `current` thay đổi theo bản ổn định; chọn nhánh phiên bản đúng hệ của bạn.
- [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html), [password file](https://www.postgresql.org/docs/current/libpq-pgpass.html): định dạng, phạm vi, lỗi và kết nối.
