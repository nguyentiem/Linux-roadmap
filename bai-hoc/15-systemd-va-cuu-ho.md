# Bài 15 — systemd, log và cứu hộ dịch vụ

[Mục lục](../README.md) · [← Bài 14](14-boot-va-shutdown.md) · [Bài 16 →](16-system-call.md)

## Mục tiêu: biến “chạy được một lệnh” thành dịch vụ có thể kiểm tra và phục hồi

Bài 14 dừng ở việc init tổ chức user space. Bài này dùng một tình huống xuyên suốt: phục vụ trang `Linux lab ready` trên chính máy lab, quản lý nó bằng systemd, cố ý làm sai thư mục làm việc rồi tìm lỗi bằng log. Cuối bài bạn cần phân biệt định nghĩa unit với trạng thái đang chạy, dependency với ordering, start với enable, reload với restart; tạo service chạy bằng tài khoản riêng; đọc journal và timer; khoanh vùng cứu hộ filesystem mà không sửa theo phỏng đoán.

Cần bài 10–14, Python 3 và curl. **VM**, máy ảo, là môi trường máy tính riêng chạy nhờ phần mềm trên máy thật; nên thực hiện phần tạo user/unit trong VM lab có quyền quản trị. Các lệnh `sudo` bên dưới thay đổi hệ thống lab. Đọc phần kiểm tra tên trước tạo, ghi lại file đã thêm để dọn đúng phạm vi. HTTP server này sẽ được dùng tiếp trong các bài mạng, bảo mật và hiệu năng; không xóa nếu còn học tiếp.

## 1. systemd quản lý gì, và `systemctl` đứng ở đâu?

**Process**, tiến trình, là một lần chạy chương trình có bộ nhớ và **PID**, mã số nhận diện riêng. **Kernel**, phần lõi hệ điều hành, quản lý process và truy cập tài nguyên. **User space** là nơi chương trình ngoài kernel hoạt động, chẳng hạn Python và systemd. **Init** là chương trình tổ chức user space đầu tiên trong một môi trường, thường có PID 1. Trên nhiều distro, systemd là init đồng thời là trình quản lý dịch vụ; nó đọc cấu hình và tạo/dừng process theo yêu cầu.

**Service**, dịch vụ, là công việc cung cấp chức năng được quản lý theo một vòng đời: khởi động, chạy, dừng hoặc thất bại. Một web server là ví dụ. **Daemon** thường chỉ chương trình phục vụ nền, không cần người dùng nhập ở terminal; service còn có thể là công việc ngắn chạy một lần, không nhất thiết là daemon tồn tại mãi.

`systemctl` là công cụ gửi yêu cầu tới trình quản lý systemd và đọc trạng thái. Có binary systemctl không đồng nghĩa hệ hiện tại dùng systemd làm PID 1. Kiểm tra trước:

```bash
ps -p 1 -o pid,comm,args
command -v systemctl
systemd --version
```

Ví dụ minh họa `1 systemd /sbin/init` cho biết chương trình PID 1; tên gọi `/sbin/init` có thể là đường trỏ tới systemd. Phiên bản systemd đã cài không tự chứng minh phiên bản manager đang chạy vừa được cập nhật; `systemctl show -p Version` hỏi thông tin manager nếu kết nối được. Container có thể có ứng dụng làm PID 1, dù có bộ công cụ systemd trên đĩa. Không tiếp tục phần quản lý system service khi công cụ báo không kết nối được manager.

**Unit** là đối tượng systemd dùng để mô tả và quản lý một thành phần. **Unit file** là file văn bản định nghĩa đối tượng, như `linux-lab-http.service`; đối tượng đang được manager nạp có trạng thái riêng, không tự đổi ngay khi bạn sửa file trên ổ. Tên đuôi cho biết loại unit:

**Socket** là điểm giao tiếp do hệ điều hành cung cấp giữa chương trình hoặc qua mạng; với web, nó gắn địa chỉ/cổng để nhận kết nối. **Filesystem** là cách tổ chức thư mục, tên và dữ liệu file; **mount** là gắn filesystem vào một thư mục gọi là **mount point**. Ví dụ mount một ổ vào `/srv` khiến nội dung ổ xuất hiện dưới `/srv`; `findmnt /srv` kiểm tra nếu `/srv` là mount point, `findmnt -T /srv` tìm filesystem đang chứa đường dẫn đó. Bảng là mô hình phân vai, không yêu cầu tạo tất cả loại unit cho server lab.

| Loại | Nó quản lý việc gì? | Ví dụ và giới hạn |
|---|---|---|
| `.service` | Chạy một chương trình/công việc | Python phục vụ trang; active chưa đủ chứng minh trang đúng |
| `.socket` | Điểm giao tiếp để nhận yêu cầu rồi kích hoạt unit | **Socket activation**, kích hoạt qua điểm giao tiếp, có thể mở điểm nhận trước server; ứng dụng phải hỗ trợ giao thức nhận socket |
| `.timer` | Mốc thời gian kích hoạt công việc | Mỗi sáng gọi một service, không phải script nằm trong timer |
| `.mount` | Một filesystem gắn vào cây thư mục | `/srv` cần có trước khi đọc trang |
| `.target` | Nhóm unit theo mục tiêu | `multi-user.target` tập hợp môi trường nhiều người dùng |


systemd có manager toàn hệ thống và manager cho từng người dùng. `systemctl --user` làm việc với manager người dùng, không phải thêm `--user` vào lab để tránh quyền sudo mà mọi directive vẫn giữ nguyên. Lab này dùng system unit ở `/etc/systemd/system`, để chạy bằng tài khoản `linuxlab` ngay cả khi người học không đăng nhập.

## 2. “Cần B” có giống “chạy sau B” không?

**Dependency**, phụ thuộc, nói unit nào được kéo vào một giao dịch khởi động/dừng; **ordering**, thứ tự, nói việc nào phải đợi việc nào khi cả hai cùng được lên lịch. Giao dịch ở đây là tập thay đổi trạng thái systemd tính ra từ một yêu cầu, không phải giao dịch database.

Giả sử ứng dụng A đọc dữ liệu do B chuẩn bị:

```text
Yêu cầu start A
  ├─ Wants=B / Requires=B → kéo B vào công việc
  └─ After=B              → A đợi bước khởi động B hoàn tất
```

Hai nhánh là hai loại ràng buộc độc lập. `After=B` một mình không start B. `Wants=B` một mình không buộc A chạy sau B. Với `Wants=`, B lỗi không tự ngăn A chỉ vì quan hệ Wants. `Requires=` ràng buộc chặt hơn: kết hợp `After=B`, nếu B khởi động thất bại thì A không khởi động; dừng B một cách tường minh cũng tác động đến A theo quan hệ đó. Không đơn giản hóa thành “mọi lần B chết bất ngờ thì A chắc chắn dừng”: nếu cần gắn vòng đời mạnh hơn, đọc `BindsTo=` và các điều kiện trong [systemd.unit](https://www.man7.org/linux/man-pages/man5/systemd.unit.5.html).

**Target** là nhóm mục tiêu, không chứng minh một tài nguyên nghiệp vụ đã sẵn sàng. `network.target` chủ yếu đánh dấu một điểm trong việc tổ chức mạng và ordering khi tắt; nó không bảo đảm Internet hay DNS dùng được. DNS là cơ chế đổi tên như `example.org` thành địa chỉ mạng. `network-online.target` dùng cùng dịch vụ chờ mạng của môi trường để đợi mức “online” được định nghĩa ở đó; vẫn không bảo đảm server từ xa khỏe hoặc mạng không mất sau đó. Lab chỉ lắng nghe chính máy nên không cần đợi Internet.

Khi kiểm chứng dependency, dùng `systemctl show NAME -p Wants -p Requires -p After` để xem quan hệ manager đã nạp và `systemctl list-dependencies NAME`. Các quan hệ tự động có thể làm danh sách dài hơn file bạn viết. Đừng tạo hai service production để thử dừng dependency; hiểu cấu hình và quan sát unit lab trước.

## 3. Khi sửa cấu hình, lệnh nào thực sự thay đổi điều gì?

| Lệnh | Tác dụng | Nó không tự chứng minh |
|---|---|---|
| `start NAME` | Yêu cầu chạy ngay theo cấu hình manager đã nạp | Sẽ chạy ở lần boot sau |
| `stop NAME` | Dừng unit hiện tại | Gỡ cơ chế kích hoạt bởi timer/socket khác |
| `enable NAME` | Tạo liên kết theo phần `[Install]` | Process đã chạy ngay |
| `enable --now NAME` | Enable rồi yêu cầu start | Ứng dụng trả nội dung đúng |
| `disable NAME` | Gỡ liên kết enable tương ứng | Unit đang chạy đã dừng |
| `disable --now NAME` | Disable và stop | Không còn bất kỳ dependency nào có thể gọi nó |
| `daemon-reload` | Manager đọc lại unit và quan hệ | Process đang chạy đã được restart |
| `reload NAME` | Yêu cầu ứng dụng nạp lại cấu hình khi unit hỗ trợ | Tạo process mới hoặc mọi service đều hỗ trợ |
| `restart NAME` | Dừng rồi khởi động lại unit | Không có gián đoạn hoặc dữ liệu chắc chắn đúng |
| `reset-failed NAME` | Xóa trạng thái failed và bộ đếm giới hạn khởi động liên quan | Nguyên nhân lỗi đã được sửa |

**Liên kết tượng trưng**, symbolic link, là một tên file chỉ sang đường dẫn khác; `ls -l` thường hiển thị `name -> target`. `[Install] WantedBy=multi-user.target` cho enable biết cần tạo liên kết trong nhóm `.wants` của target. systemd không cần enable để bạn start thủ công. Unit có trạng thái `static` thường không có cấu hình enable trực tiếp; nó vẫn có thể được kéo vào qua dependency.

Muốn đọc kết quả, dùng `systemctl is-enabled NAME` để hỏi cấu hình enable, `systemctl is-active NAME` để hỏi trạng thái hoạt động, và phép thử chức năng như curl. Hai lệnh đầu có exit status khác `0` trong các trạng thái không phù hợp; đọc cả chuỗi trả về, không coi mọi khác `0` là chương trình systemctl bị hỏng. **Exit status** là mã kết thúc của lệnh: `0` thường thành công; `$?` chỉ mã của lệnh gần nhất.

## 4. Lab: tạo HTTP service cục bộ có danh tính riêng

### 4.1. Server phục vụ gì và tiếp nhận ở đâu?

**HTTP** là giao thức client gửi yêu cầu và server trả nội dung/trạng thái, như trình duyệt xin trang `/`. **Client** là bên yêu cầu; ở lab là `curl`. **Server** là bên lắng nghe/xử lý; ở lab là module `http.server` của Python. **Loopback** là đường giao tiếp mạng quay về chính máy, thường dùng địa chỉ `127.0.0.1` cho IPv4. **Port**, cổng, là số phân biệt điểm nhận của dịch vụ, ở đây `8080`. **Bind** là đăng ký địa chỉ/cổng mà socket sẽ lắng nghe.

Vì vậy `--bind 127.0.0.1` giới hạn địa chỉ nghe ở loopback trong môi trường mạng hiện tại. Máy khác không truy cập trực tiếp qua địa chỉ LAN của bạn; nếu chạy trong VM, curl ở trong VM mới truy cập loopback của VM. Không đặt bí mật vào thư mục phục vụ: Python HTTP server chỉ để học, không có hệ thống xác thực/kiểm soát đầy đủ cho triển khai thật, theo [tài liệu Python http.server](https://docs.python.org/3/library/http.server.html).

### 4.2. Kiểm tra điều kiện và tên để tránh đụng dữ liệu hiện có

```bash
command -v python3
command -v curl
command -v nologin
python3 --version
getent passwd linuxlab
getent group linuxlab
systemctl cat linux-lab-http.service
ls -ld /srv/linux-lab-web
ss -ltn 'sport = :8080'
```

`getent` tra cơ sở tài khoản/nhóm đã cấu hình, không chỉ một file cục bộ. Không có dòng cho tên lab thường là chưa tồn tại; `systemctl cat` có thể báo unit không tìm thấy; `ls` có thể báo đường dẫn chưa có. Nếu bất kỳ tài khoản, nhóm, unit hoặc thư mục đã tồn tại, dừng bước tạo và xem có phải đúng lab của bạn từ lần trước không; không ghi đè đồ của hệ khác.

`ss` xem socket: `-l` lấy đang lắng nghe, `-t` chọn TCP (giao thức truyền dữ liệu theo kết nối), `-n` giữ địa chỉ/cổng dạng số. Cột `Local Address:Port` có `127.0.0.1:8080`, `0.0.0.0:8080` hoặc một địa chỉ khác là đã có người dùng cổng; cả lắng nghe IPv6 kiểu `[::]:8080` cũng cần xét vì có thể nhận IPv4 tùy cấu hình. Lab chọn cổng khác nếu cần và sửa đồng bộ ExecStart cùng URL curl, tránh dừng dịch vụ của người khác.

Bên dưới giả định `/usr/bin/python3` và `/usr/sbin/nologin` đúng trên distro của bạn; nếu `command -v` trả đường dẫn khác, xác nhận và thay trước khi tạo. **Shell** là chương trình diễn giải câu lệnh; `nologin` làm shell từ chối đăng nhập tương tác, nhưng systemd vẫn có thể chạy service với tài khoản đó.

### 4.3. Tạo tài khoản và dữ liệu lab

**User**, tài khoản người dùng, và **group**, nhóm tài khoản, là danh tính kernel dùng để kiểm tra **permission**, quyền đọc/ghi/thực thi. Mục đích tài khoản riêng là giới hạn quyền của server. Không cần chạy server bằng root chỉ để đọc trang ở cổng `8080`.

Chạy từng bước trên VM lab sau khi kiểm tra tên đều chưa tồn tại:

```bash
sudo useradd --system --user-group --no-create-home \
    --shell /usr/sbin/nologin linuxlab
getent passwd linuxlab
getent group linuxlab
sudo install -d -o root -g root -m 0755 /srv/linux-lab-web
printf 'Linux lab ready\n' | sudo tee /srv/linux-lab-web/index.html >/dev/null
sudo chmod 0644 /srv/linux-lab-web/index.html
ls -ld /srv/linux-lab-web
ls -l /srv/linux-lab-web/index.html
```

`sudo` chạy lệnh với quyền được chính sách cho phép, thường là quản trị. `--system` chọn loại tài khoản hệ thống theo distro; `--user-group` yêu cầu nhóm riêng cùng tên, vì không nên đoán mặc định `useradd` sẽ tạo nhóm. `--no-create-home` không tạo home; `install -d` tạo thư mục cùng chủ/nhóm/quyền. Trên hệ BusyBox hoặc distro không dùng shadow-utils, option `useradd` có thể khác; không dùng nguyên lệnh nếu `useradd --help` không hỗ trợ.

Chủ thư mục/file là root, group root; `0755` cho chủ quyền đọc/ghi/đi xuyên thư mục, tài khoản khác đọc và đi xuyên; `0644` cho chủ đọc/ghi file, tài khoản khác chỉ đọc. Với thư mục, quyền `x` cho phép đi qua để tìm file bên trong, không phải chạy thư mục như chương trình. Server `linuxlab` có thể đọc trang nhưng không được sửa trang theo các quyền này. `sudo tee` mới là chương trình ghi file với quyền quản trị; `sudo printf ... > /srv/...` không làm thao tác redirection của shell trở thành root.

### 4.4. Viết unit và hiểu từng phần

Dùng `sudoedit /etc/systemd/system/linux-lab-http.service` để tạo file với nội dung:

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

`[Unit]` mô tả/quan hệ chung, `[Service]` cách chạy process, `[Install]` cách enable. `Type=simple` coi bước start đạt mốc khi process được tạo theo cơ chế của loại này; nó không đợi server bind cổng xong. Đó là lý do curl có thể cần thử lại ngắn sau start. **Working directory**, thư mục làm việc, là gốc để chương trình hiểu đường dẫn tương đối và cũng là nơi `http.server` phục vụ file trong lệnh này. `ExecStart` là chương trình cùng các argument để chạy; systemd không tự đưa dòng ấy qua Bash. Các ký hiệu `|`, `>` hoặc `&&` không tự trở thành pipeline/redirection như shell; dùng script riêng khi cần logic đó.

`Restart=on-failure` thử lại trong những tình huống được coi thất bại; dừng bằng `systemctl stop` không yêu cầu tự sống lại như lỗi. `RestartSec=2s` chờ giữa các lần thử. Đây không phải cách chữa mọi lỗi: cùng thư mục sai vẫn tiếp tục thất bại và có thể chạm **start rate limit**, giới hạn số lần start trong một khoảng thời gian. `NoNewPrivileges=yes` yêu cầu không lấy đặc quyền mới qua những cơ chế như exec file nâng quyền; nó không loại bỏ mọi quyền tài khoản đã có. `PrivateTmp=yes` cho service góc nhìn riêng về các thư mục tạm theo cơ chế systemd; không có nghĩa cả filesystem cô lập hoặc server không đọc được mọi file khác mà tài khoản được phép đọc. Đối chiếu [systemd.exec](https://www.man7.org/linux/man-pages/man5/systemd.exec.5.html) cho quyền và môi trường thực thi.

```text
systemctl start
  → systemd đọc định nghĩa đã nạp
  → chuẩn bị danh tính/thư mục/môi trường
  → chạy Python → bind 127.0.0.1:8080
  → curl gửi GET / → Python đọc index.html → trả nội dung
                    ↘ sự kiện/báo lỗi → journal
```

Mũi tên đầu là yêu cầu quản lý, các mũi tên sau là đường đến kết quả ứng dụng. Nếu không chuyển được thư mục làm việc, Python chưa tới bước bind. Nếu bind lỗi do cổng bận, process có thể đã chạy nhưng kết thúc. Đó là hai nguyên nhân khác nhau dù cuối cùng bạn đều không lấy được trang.

### 4.5. Nạp, enable/start và kiểm chứng ba lớp

```bash
sudo systemd-analyze verify /etc/systemd/system/linux-lab-http.service
sudo systemctl daemon-reload
sudo systemctl enable --now linux-lab-http.service
systemctl is-enabled linux-lab-http.service
systemctl is-active linux-lab-http.service
systemctl status linux-lab-http.service --no-pager
systemctl show linux-lab-http.service \
    -p User -p Group -p MainPID -p ActiveState -p SubState -p Result
curl --fail --retry 3 --retry-connrefused --retry-delay 1 \
    http://127.0.0.1:8080/
journalctl -u linux-lab-http.service -b -n 30 --no-pager
```

`verify` kiểm tra nhiều lỗi định nghĩa và dependency mà không start service; nếu có lỗi cần hiểu/sửa trước đi tiếp. Nó không kiểm tra ứng dụng có bind được cổng hay nội dung trang đúng. Đọc `--help` nếu curl quá cũ không hỗ trợ option retry tương ứng; có thể đợi ngắn rồi gọi `curl --fail` lại.

Ba lớp cần khớp: cấu hình `enabled`; manager `active (running)` và `User=linuxlab`, `Group=linuxlab`; ứng dụng trả `Linux lab ready`. `MainPID` là PID process chính mà manager theo dõi, thường thay đổi khi restart. `Result=success` phản ánh kết quả quản lý được ghi nhận, không chứng minh nội dung nghiệp vụ đúng. Với `MainPID` đang khác `0`, kiểm tra thật danh tính:

```bash
pid=$(systemctl show linux-lab-http.service -p MainPID --value)
ps -p "$pid" -o pid,user,group,args
```

Nếu service không chạy và PID là `0`, đừng dùng kết quả này như một process thật. `ps` có thể không tìm thấy nếu process vừa kết thúc; quay lại status/journal. Minh họa đúng là một PID dương, USER/GROUP `linuxlab`, args chứa Python HTTP server.

Ở journal, `-u` chọn unit, `-b` lần boot hiện tại, `-n 30` 30 mục gần nhất. Một dòng minh họa có `"GET / HTTP/1.1" 200` nghĩa là đã nhận yêu cầu GET và trả trạng thái HTTP `200` cho yêu cầu đó. Không có dòng này có thể vì chưa gửi yêu cầu, quyền đọc log hoặc cấu hình log khác; không tự suy ra Python chưa chạy. `curl --fail` coi nhiều mã HTTP lỗi là thất bại, nhưng `200` chưa đủ nếu nội dung sai; phải đọc nội dung mong đợi.

## 5. Lab lỗi: tìm đúng nguyên nhân trước khi restart thêm

**Drop-in** là file cấu hình bổ sung trong thư mục `NAME.service.d/`, được hợp nhất với unit chính. Nó giúp đổi một phần mà vẫn giữ file chính. `systemctl cat NAME` xem cả file chính và các drop-in; `systemctl show` xem giá trị manager đã nạp. Thay đổi trên đĩa và giá trị đang nạp cần được phân biệt.

Chỉ thử sau khi service lab đúng đang phục vụ. Dùng `sudo systemctl edit linux-lab-http.service` tạo drop-in qua trình soạn thảo; đặt nội dung trong vùng sẽ được lưu, không đặt trong phần chú thích bị loại:

```ini
[Service]
WorkingDirectory=/srv/linux-lab-does-not-exist
```

Xác nhận đường dẫn ấy thực sự không tồn tại trước thử. Sau edit, làm rõ việc nạp rồi restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart linux-lab-http.service
systemctl status linux-lab-http.service --no-pager
journalctl -u linux-lab-http.service -b -n 40 --no-pager
systemctl show linux-lab-http.service \
    -p WorkingDirectory -p Result -p ExecMainCode -p ExecMainStatus -p NRestarts
```

Ở nhiều bản systemd, thông báo minh họa là `Failed at step CHDIR` hoặc `status=200/CHDIR`: **CHDIR** nghĩa là đổi thư mục làm việc. Đây là mã lỗi của bước chuẩn bị process do systemd định nghĩa, không phải trạng thái HTTP 200 của server. `ExecMainStatus` là mã kết thúc/tín hiệu theo `ExecMainCode`; đừng tách một số khỏi ngữ cảnh rồi đoán. `NRestarts` đếm các lần tự restart liên quan, không nhất thiết là toàn bộ lịch sử unit từ lúc cài. Status có thể là `activating (auto-restart)` giữa các lần thử hoặc `failed` khi hết giới hạn; mốc bạn đọc ảnh hưởng kết quả.

Để không tiếp tục vòng thử vô ích, `sudo systemctl stop linux-lab-http.service`, sửa lại drop-in qua `systemctl edit` thành `/srv/linux-lab-web`, rồi:

```bash
sudo systemctl daemon-reload
systemctl cat linux-lab-http.service
systemctl show linux-lab-http.service -p WorkingDirectory
sudo systemctl reset-failed linux-lab-http.service
sudo systemctl start linux-lab-http.service
curl --fail --retry 3 --retry-connrefused --retry-delay 1 \
    http://127.0.0.1:8080/
```

`reset-failed` sau sửa giúp bỏ trạng thái/bộ đếm lỗi, không được dùng thay sửa đường dẫn. Thành công cần giá trị WorkingDirectory đã đúng, process chạy và curl trả đúng trang. Log lỗi cũ vẫn còn trong journal để giải thích lịch sử; không phải cứ thấy chữ failed trong log là lỗi hiện tại còn tồn tại.

Nếu lỗi khác, tìm chuỗi nguyên nhân gần lần start: `203/EXEC` thường liên quan bước thực thi chương trình như đường dẫn/permission; lỗi User/Group liên quan danh tính; `Address already in use` là ứng dụng không bind được cổng. Tra [mã lỗi thực thi systemd](https://www.man7.org/linux/man-pages/man5/systemd.exec.5.html) và đối chiếu bản cài thay vì nhớ số rồi áp vào mọi log.

## 6. Log còn đến đâu, và boot chậm phải đọc thế nào?

**Journal** là nơi ghi sự kiện có các trường như thời gian, unit và nguồn phát; **log** là bản ghi cụ thể. `journalctl` truy vấn chứ không tự tạo lại dữ liệu đã mất. Kiểm tra các boot còn giữ:

```bash
journalctl --list-boots --no-pager
journalctl -b -1 -n 50 --no-pager
journalctl --disk-usage
systemd-analyze time
systemd-analyze critical-chain
systemd-analyze blame
```

`--list-boots` thường cho số thứ tự tương đối, boot ID và khoảng thời gian log; `-b -1` chọn boot ngay trước trong dữ liệu còn giữ. Boot ID là mã nhận diện một lần khởi động, giúp phân biệt lịch sử dù đồng hồ thay đổi. Nếu chỉ có boot hiện tại, không giả định lần trước sạch lỗi: log có thể không được giữ qua reboot hoặc đã bị giới hạn dung lượng/thời gian.

**Volatile** là lưu tạm, thường ở `/run/log/journal`, có thể mất sau reboot; **persistent** là lưu bền vững, thường ở `/var/log/journal`. Chế độ thực tế phụ thuộc `Storage=` và chính sách distro trong cấu hình journald. **Retention** là chính sách giữ log bao lâu/bao nhiêu dung lượng; persistence không nghĩa là giữ mãi. Có thể đọc `man journald.conf` và [tài liệu journald.conf](https://www.man7.org/linux/man-pages/man5/journald.conf.5.html). Lab không đổi cấu hình lưu log: trước khi áp dụng thực tế, cân nhắc dung lượng, quyền và dữ liệu nhạy cảm trong log.

`systemd-analyze blame` xếp thời gian kích hoạt, không tự xác định nguyên nhân boot chậm. Các unit có thể song song; `Type=simple` có thể được coi started trước ứng dụng sẵn sàng. Dùng `critical-chain` để xem đường ordering được chọn, journal để biết việc đợi/lỗi cụ thể, rồi phép đo chức năng để xác nhận. Không cộng mọi số ở blame thành tổng boot time.

## 7. Nếu không vào được môi trường bình thường, cứu hộ từ đâu?

**Rescue mode** là môi trường sửa chữa với một tập dịch vụ cơ bản; **emergency mode** tối thiểu hơn, có thể dùng khi mount hoặc phụ thuộc quan trọng lỗi. **Console** là màn hình/bàn phím trực tiếp hoặc console của VM; cần nó vì mạng/đăng nhập từ xa có thể chưa chạy. Khác với shell trong initramfs: shell ấy có thể xuất hiện trước khi root thật đã được chuẩn bị.

Không chạy `systemctl isolate rescue.target` hay emergency trên máy đang làm việc chỉ để xem: **isolate** chuyển mục tiêu và có thể dừng các unit không cần, làm mất phiên kết nối. Nếu cần thực hành, dùng VM riêng đã chụp snapshot và hướng dẫn distro; bài này chỉ luyện chuỗi chẩn đoán đọc dữ liệu.

Khi emergency có vẻ liên quan mount:

```bash
journalctl -b -p warning --no-pager
systemctl --failed --no-pager
findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS /
findmnt --verify --verbose
lsblk -f
cat /etc/fstab
```

`-p warning` chọn mức warning và nghiêm trọng hơn; log ở mức thấp hơn có thể chứa ngữ cảnh quan trọng, nên quay về `journalctl -b` khi cần. **`fstab`** là cấu hình các filesystem/mount tại `/etc/fstab`; các trường nêu nguồn, mount point, loại filesystem và lựa chọn. **UUID** là mã nhận diện dùng để đối chiếu nguồn với `lsblk -f`; tên `/dev/sdb` có thể thay theo thứ tự nhận thiết bị. `findmnt --verify` kiểm tra tính hợp lệ/khả dụng của khai báo ở mức công cụ, không thực hiện mount toàn bộ và không xác nhận nội dung filesystem là lành mạnh.

Ví dụ minh họa: `/etc/fstab` yêu cầu `UUID=OLD` gắn vào `/data`, journal báo timed out waiting for thiết bị đó, `lsblk -f` cho thấy ổ dự kiến có UUID khác. Đây là bằng chứng để kiểm tra entry có trỏ nhầm không; chưa đủ tự sửa thành UUID bất kỳ xuất hiện đầu danh sách. Phải xác nhận đúng thiết bị, dữ liệu và mục đích mount. Sau khi sao lưu cấu hình và sửa đúng entry trên VM cứu hộ, kiểm tra verify lại rồi thử **mount riêng entry đã hiểu**, thay vì gọi `mount -a` mù quáng lên mọi cấu hình. `mount -a` có thể gây thay đổi trên nhiều điểm cùng lúc.

**fsck** là nhóm công cụ kiểm tra/sửa cấu trúc filesystem, tùy filesystem dùng trình tương ứng. Không chạy fsck chế độ sửa trên filesystem đang mounted: chương trình khác và kernel có thể cùng thay đổi dữ liệu mà fsck đang sửa. Root chỉ đọc vẫn là mounted, không mặc định an toàn để sửa. Trước sửa phải dùng môi trường cứu hộ phù hợp, xác nhận đúng thiết bị và trạng thái unmounted, có bản sao dữ liệu khi cần; một số filesystem như XFS có công cụ/quy trình riêng. Nếu lỗi chỉ là UUID sai trong fstab thì fsck không chữa việc trỏ sai. Đọc [e2fsck](https://man7.org/linux/man-pages/man8/e2fsck.8.html) cho ext2/3/4, không áp quy trình đó cho mọi filesystem.

## 8. Timer và cron: ai quyết định khi nào chạy công việc?

**Cron** là chương trình lên lịch chạy lệnh theo biểu thức thời gian và môi trường riêng. **Systemd timer** là unit theo dõi thời gian rồi kích hoạt một unit khác, thường là service; nhờ đó dùng lại quản lý trạng thái và journal. Không cấu hình cron lẫn timer cho cùng backup nếu chưa có cơ chế khóa chống trùng như bài 13. Cả hai đều cần tính đến quyền, PATH và nơi lưu log.

Ta tạo công việc vô hại chỉ in một mốc vào journal, không tự backup dữ liệu. Kiểm tra chưa có unit `linux-lab-tick.service`/`.timer` trước tạo. Dùng sudoedit tạo `/etc/systemd/system/linux-lab-tick.service`:

```ini
[Unit]
Description=Course timer marker

[Service]
Type=oneshot
ExecStart=/usr/bin/printf "Linux course timer fired\n"
```

`Type=oneshot` dùng cho công việc chạy xong rồi kết thúc; không cần một process tồn tại mãi. Cú pháp escape trong ExecStart thuộc systemd, không phải Bash; `\n` trong unit được parser xử lý thành xuống dòng trong argument ở trường hợp này. Kiểm tra `/usr/bin/printf` có thật, không chỉ builtin printf trong shell, vì ExecStart chạy chương trình ngoài.

Tạo `/etc/systemd/system/linux-lab-tick.timer`:

```ini
[Unit]
Description=Course timer demonstration

[Timer]
OnActiveSec=10s
AccuracySec=1s
Unit=linux-lab-tick.service
```

`OnActiveSec=10s` tính tương đối từ lúc timer được kích hoạt. `AccuracySec=1s` cho phép gom lịch trong khoảng dung sai nhằm giảm các lần đánh thức CPU, không bảo đảm chạy đúng chính xác mốc 10 giây. **Monotonic time**, thời gian tương đối không dựa vào lịch ngày/giờ, dùng cho kiểu timer này; thời gian ngủ của máy và cấu hình WakeSystem có các quy tắc riêng. **Wall clock** là giờ lịch như 03:00 ngày cụ thể, có thể bị chỉnh đồng hồ và chịu múi giờ.

```bash
sudo systemd-analyze verify /etc/systemd/system/linux-lab-tick.service \
    /etc/systemd/system/linux-lab-tick.timer
sudo systemctl daemon-reload
sudo systemctl start linux-lab-tick.timer
systemctl list-timers --all linux-lab-tick.timer --no-pager
```

Sau khoảng 10–12 giây, đọc:

```bash
journalctl -u linux-lab-tick.service -b -n 10 --no-pager
systemctl show linux-lab-tick.service -p Result -p ExecMainStatus
systemctl list-timers --all linux-lab-tick.timer --no-pager
```

`NEXT`/`LEFT` cho lần tới và thời gian còn lại; `LAST`/`PASSED` cho lần đã kích hoạt và khoảng thời gian qua; `UNIT` là timer, `ACTIVATES` là công việc được gọi. Trước lần đầu LAST có thể trống, sau một lần timer này không có lịch lặp nên NEXT có thể trống. Journal cần có `Linux course timer fired`, status của oneshot có thể inactive sau khi hoàn tất mà vẫn `Result=success`, `ExecMainStatus=0`. Không coi mọi inactive là lỗi; nó phù hợp vòng đời công việc một lần.

Lịch lặp theo giờ lịch dùng `OnCalendar=`, ví dụ `*-*-* 03:00:00`; kiểm tra cách hiểu bằng `systemd-analyze calendar '*-*-* 03:00:00'` trước tạo timer. Đọc dòng normalized và next elapse để xác nhận. **Timezone**, múi giờ, và **DST**, quy tắc đổi giờ mùa hè ở một số nơi, có thể thay kỳ vọng giờ chạy; ghi rõ múi giờ cho công việc nghiệp vụ. `Persistent=true` áp dụng với calendar timer để có thể chạy bù một lần khi bỏ lỡ trong thời gian timer không hoạt động, không chạy lại riêng từng kỳ đã bỏ lỡ. Timer không tự tạo phiên song song mới nếu unit đích còn active; vẫn cần suy nghĩ cơ chế chống trùng khi nhiều cách gọi cùng công việc. Xem [systemd.timer](https://www.man7.org/linux/man-pages/man5/systemd.timer.5.html) để đối chiếu giới hạn.

Dừng/dọn marker khi quan sát xong:

```bash
sudo systemctl stop linux-lab-tick.timer linux-lab-tick.service
sudo rm -- /etc/systemd/system/linux-lab-tick.timer \
    /etc/systemd/system/linux-lab-tick.service
sudo systemctl daemon-reload
```

Chỉ xóa nếu đó là hai file bạn tạo và không có cấu hình khác cần giữ. Không cần enable marker: bài này muốn một lần kích hoạt ngắn, không tác vụ tự chạy ở mọi boot.

## 9. Dọn HTTP lab khi không còn dùng, và lỗi thường gặp

Nếu học tiếp các bài mạng/bảo mật, giữ server lab. Khi thật sự dọn: disable/stop `linux-lab-http.service`; xem `systemctl cat` để xác định đúng file/drop-in đã tạo; xóa riêng file unit và drop-in của lab; daemon-reload; rồi mới xóa trang/thư mục và tài khoản/nhóm lab nếu không còn process hoặc dữ liệu khác dùng chúng. Xem `getent passwd`, `getent group`, `ps -u linuxlab` trước xóa danh tính. Không dùng `systemctl revert` nếu đã có thay đổi khác cần giữ, vì nó có thể gỡ nhiều lớp tùy chỉnh chứ không chỉ lỗi thử nghiệm.

| Hiện tượng | Kiểm tra đúng lớp |
|---|---|
| Enable thành công, curl không kết nối | Enable không là start; xem active, journal và ss |
| Active nhưng nhận trang khác | Có thể đúng process nhưng thư mục/nội dung sai; kiểm tra WorkingDirectory và file |
| Đổi unit mà process không đổi | Daemon-reload nạp định nghĩa, restart mới đổi vòng đời |
| Service không hỗ trợ reload | Đọc ExecReload/loại service; không ép mọi app có cùng cách reload |
| `start request repeated too quickly` | Sửa lỗi gốc rồi reset-failed; tăng giới hạn không chữa lỗi đường dẫn |
| Chạy thủ công được, service lỗi | Khác user, quyền, thư mục, PATH hoặc môi trường; xem show/journal |
| `journalctl -b -1` không có dữ liệu | Kiểm tra list-boots, Storage và retention; không suy ra boot trước không lỗi |
| Python vẫn còn khi unit đã dừng | Kiểm tra PID/cgroup và có phải process khởi động thủ công ngoài unit không |

**Cgroup**, nhóm điều khiển tài nguyên của kernel, là cách gom các process liên quan để theo dõi và kiểm soát; systemd thường dùng nó cho unit. Cột CGroup trong status giúp nhìn process thuộc service, không coi mọi process có tên python3 là của lab. Đừng dùng `killall python3` để dọn một unit vì có thể dừng công việc khác.

## 10. Tự kiểm tra và tiêu chí đạt

1. Unit A chỉ có `After=B`. Start A có chắc start B? **Tiêu chí:** không; ordering cần phân biệt quan hệ kéo vào như Wants/Requires.
2. `is-enabled` trả enabled, `is-active` trả inactive. Có thể đúng cấu hình không? **Tiêu chí:** có; enable và trạng thái hiện tại là hai trục, hoặc oneshot đã kết thúc.
3. Journal có `200/CHDIR`, curl trước đó có HTTP 200. Hai số 200 giống nghĩa không? **Tiêu chí:** không, mã systemd bước đổi thư mục khác status HTTP của yêu cầu.
4. Sửa file unit rồi chạy daemon-reload, PID giữ nguyên. Có gì sai? **Tiêu chí:** chưa restart; manager đọc lại định nghĩa không tự thay process.
5. Đổi WorkingDirectory thành nơi có thật nhưng linuxlab không đi qua được. Bạn kiểm tra gì? **Tiêu chí:** permission trên mọi thư mục cha, journal và danh tính, không chỉ file cuối.
6. Timer đã chạy, service oneshot inactive. Bạn kết luận thế nào? **Tiêu chí:** xem Result/status và journal; hoàn tất một lần có thể inactive bình thường.
7. `findmnt --verify` thành công. Có thể khẳng định ổ không hỏng? **Tiêu chí:** không; đây là kiểm tra khai báo/khả dụng theo công cụ, không kiểm tra toàn bộ filesystem/phần cứng.
8. Chỉ có boot hiện tại trong journal. Cần làm gì trước khi tìm nguyên nhân boot cũ? **Tiêu chí:** xác nhận dữ liệu còn giữ và chính sách persistence/retention, không tạo lại bằng chứng đã mất.

Bạn đạt bài khi service chạy dưới linuxlab, đã enable, curl trả đúng nội dung, lỗi CHDIR được tìm và sửa bằng bằng chứng, marker timer ghi được sự kiện. Kiểm tra “sống qua reboot” chỉ ở lần reboot VM lab đã được chủ động chuẩn bị: sau đó kiểm tra enabled, active, user và curl lại; không bắt buộc reboot máy đang làm việc để hoàn thành các bước trên và không ghi là đã kiểm chứng qua reboot khi chưa thực hiện.

Mô hình tự nhắc: unit file là ý định → daemon-reload nạp ý định → start tạo vòng đời → status/journal cho biết cơ chế → curl xác nhận chức năng. Enable nối unit vào đường kích hoạt; ordering không tự tạo dependency; log chỉ chứng minh sự kiện còn được lưu. Bài 16 sẽ xuống lớp system call để thấy process Python nhờ kernel làm việc như thế nào.

## Nguồn và đối chiếu phiên bản

- [systemd.service](https://www.man7.org/linux/man-pages/man5/systemd.service.5.html): loại service, restart và cách xác định mốc start.
- [systemctl](https://www.man7.org/linux/man-pages/man1/systemctl.1.html): start/enable/reload/reset-failed và việc sửa unit.
- [journalctl](https://www.man7.org/linux/man-pages/man1/journalctl.1.html): bộ lọc boot/unit, quyền và cách truy vấn log.
- [systemd networking](https://systemd.io/NETWORK_ONLINE/): ý nghĩa các target mạng và giới hạn readiness.
- Các trang man7 của systemd xuất bản tài liệu dự án upstream; bản trực tuyến có thể mới hơn máy bạn. `man systemd.unit`, `man systemd.service`, `man systemd.exec`, `man systemd.timer`, `man systemctl` của phiên bản cài là mốc đối chiếu option. Các đầu ra ghi “minh họa” không phải kết quả cố định hay khẳng định đã chạy trên máy của người học.
