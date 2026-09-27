# Bài 25 — Dịch vụ mạng, reverse proxy và firewall

[Mục lục](../README.md) · [← Bài 24](24-mang-linux.md) · [Bài 26 →](26-xac-thuc-va-mac.md)

## Mục tiêu: theo một yêu cầu qua hai kết nối và các lớp kiểm soát

Một trang web đi qua Nginx trả lỗi 502, nhưng process Nginx vẫn chạy. Điều đó có thể hoàn toàn đúng: proxy đã nhận yêu cầu của client nhưng không kết nối được backend. Đồng thời một listener đang mở không bảo đảm máy khác truy cập được, và một kết nối được firewall cho qua không bảo đảm tài khoản đã xác thực.

Sau bài này, bạn cần vẽ client → proxy → backend, phân biệt địa chỉ bind với quyền truy cập mạng, đọc lỗi từng chặng, hiểu input/output/forward và connection tracking, cùng xác minh TLS/SSH đúng lớp. Nên đã học bài 15 và 24.

Lab chính chạy Nginx và Python với cấu hình/thư mục tạm, cổng loopback riêng, không thay service đã cài, không viết `/etc/nginx`, không đổi firewall máy đang làm việc. Lab firewall chỉ dành cho VM dùng riêng có console và điều kiện được ghi rõ; có thể học cơ chế qua file mẫu mà không thực thi thay đổi. Không dùng các bước của VM lên host.

## 1. Có socket lắng nghe thì ai kết nối được?

**Service — dịch vụ** là chương trình cung cấp chức năng lâu dài; **process — tiến trình** là một lần chương trình đang chạy, có mã **PID** để nhận diện. **Kernel — nhân hệ điều hành** quản lý tài nguyên và giao tiếp mạng. **Socket — đầu giao tiếp** là đối tượng ứng dụng dùng để gửi/nhận; **port — cổng** là số TCP/UDP dùng chọn đầu giao tiếp trên một địa chỉ. **TCP** cung cấp luồng byte có thứ tự giữa hai đầu.

**Bind — gắn socket vào địa chỉ/cổng cục bộ** chọn nơi nhận. **Listener — socket chờ kết nối TCP** hiện qua `ss -lnt`: xem cột `Local Address:Port`. **Loopback — đường quay về cùng môi trường mạng** dùng địa chỉ IPv4 `127.0.0.1` hoặc IPv6 `::1`. **Network namespace — phạm vi mạng riêng** có socket, interface và route riêng; `127.0.0.1` trong container khác không tự trỏ đến server trên host.

| Listener | Phạm vi chọn bởi bind | Điều chưa được bảo đảm |
|---|---|---|
| `127.0.0.1:18080` | Loopback IPv4 trong namespace đó | Máy khác không kết nối bằng IP ngoài của server vào listener này |
| `IP_LAB:18080` | Địa chỉ lab cụ thể của máy | Còn phụ thuộc route và luật lọc |
| `0.0.0.0:18080` | Các địa chỉ IPv4 cục bộ phù hợp | Không vượt qua firewall hoặc tự công bố ra Internet |
| `[::]:18080` | Các địa chỉ IPv6 phù hợp | Có nhận IPv4-mapped hay không còn tùy tùy chọn socket/cấu hình |

**IPv4-mapped** là cách biểu diễn một địa chỉ IPv4 trong dạng IPv6 cho socket hỗ trợ hai họ địa chỉ. **`IPV6_V6ONLY`** là tùy chọn socket quyết định chỉ nhận IPv6; Nginx có lựa chọn `ipv6only` riêng trong `listen`. Không suy từ `[::]` sang “chắc chắn nhận IPv4”. Xem [ipv6(7)](https://man7.org/linux/man-pages/man7/ipv6.7.html) và [Nginx listen](https://nginx.org/en/docs/http/ngx_http_core_module.html#listen).

Tự kiểm tra bằng `ss -lnt`, thêm `-p` nếu quyền cho phép để đối chiếu process. Chỉ thấy listener không chứng minh HTTP trả đúng dữ liệu. Bài dùng cổng 18080/18081 trên loopback để tránh tác động dịch vụ 8080 ở bài 15; nếu đã bị chiếm, chọn cặp khác và sửa mọi chỗ tương ứng.

## 2. Reverse proxy có phải router hoặc firewall?

**Client — bên yêu cầu** gửi truy vấn HTTP; **HTTP** là quy tắc trao đổi yêu cầu, trạng thái và nội dung web. **Reverse proxy — máy chủ trung gian đứng trước dịch vụ** nhận yêu cầu như server, rồi gửi yêu cầu đến một máy chủ phía sau. **Backend/upstream — bên phục vụ phía sau proxy** xử lý yêu cầu đó. Đây là vai trò ở lớp ứng dụng; khác **router — thành phần chuyển packet giữa mạng**, và **firewall — thành phần lọc lưu lượng theo quy tắc**.

```text
Client curl                   Nginx                    Python backend
    |                           |                            |
    +-- kết nối TCP số 1 ------->|                            |
    |   HTTP GET /              +-- kết nối TCP số 2 -------->|
    |                           |   yêu cầu đến upstream      |
    |                           |<------ HTTP response -------+
    |<------ HTTP response -----+                            |
```

Đọc trái sang phải rồi quay lại. Hai mũi tên kết nối là **hai kết nối riêng**, có địa chỉ/cổng, thời gian chờ và lỗi riêng. Proxy có thể dùng lại kết nối tùy cấu hình; không mặc định mỗi yêu cầu luôn tạo đúng một kết nối mới. Proxy còn có thể cân bằng tải, giữ cache hoặc thực hiện kiểm tra khác, nhưng lab chỉ chuyển HTTP.

**TLS — giao thức bảo vệ kết nối bằng mã hóa và xác minh danh tính** thường dùng với HTTPS. **TLS termination — kết thúc TLS tại proxy** nghĩa proxy xử lý kết nối TLS từ client rồi dùng một kết nối khác đến backend, có thể là HTTP hoặc HTTPS tùy thiết kế. Có HTTPS ở mặt ngoài không tự bảo đảm chặng backend cũng được mã hóa. Lab dùng HTTP loopback, không tạo chứng chỉ hay triển khai TLS.

**Timeout — giới hạn chờ** phải gắn với chặng và thao tác. `proxy_connect_timeout` giới hạn thiết lập kết nối đến upstream. `proxy_read_timeout` là giới hạn khoảng chờ giữa hai lần đọc từ upstream, **không phải tổng thời gian của toàn response**. Backend gửi từng phần đều đặn có thể làm response kéo dài hơn giá trị này. Xem [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

### Header có cho biết danh tính client thật không?

**Header — trường thông tin đầu thông điệp HTTP** như `Host`, `X-Forwarded-For`, `X-Forwarded-Proto` truyền tên đích, địa chỉ được chuyển tiếp và giao thức. Client có thể tự gửi nhiều header; không dùng một chuỗi client cung cấp làm bằng chứng đã xác thực.

Trong lab, `Host $host` truyền tên đích mà Nginx xác định; `$remote_addr` là địa chỉ peer trực tiếp của kết nối vào proxy; `$scheme` là giao thức client–proxy theo góc nhìn Nginx. Ta **ghi đè** `X-Forwarded-For` bằng `$remote_addr` để không giữ chuỗi tùy ý do client gửi ở biên trực tiếp này. Cấu hình hay gặp `$proxy_add_x_forwarded_for` nối thêm peer vào chuỗi đã nhận; dùng nó cần mô hình tin cậy rõ cho các proxy phía trước, không lấy phần đầu chuỗi làm danh tính mặc định.

Backend chỉ nên tin forwarding header từ nguồn proxy được xác định và nên giới hạn đường truy cập trực tiếp nếu chính sách dựa vào proxy. Một proxy phía trước nữa hoặc cấu hình real IP sẽ thay cách hiểu địa chỉ; lab một proxy không chứng minh cấu hình chuỗi proxy production — hệ phục vụ thật — an toàn.

## 3. Lab proxy cục bộ: cấu hình riêng, không sửa service hệ thống

### 3.1. Chuẩn bị điều kiện

**Terminal — cửa sổ giao tiếp văn bản** cho phép gõ lệnh; **shell — chương trình diễn giải lệnh**, ở đây là Bash. Dùng terminal không bật `set -e`, vì `wait` sau khi dừng một con có thể trả mã khác 0 có chủ đích. Cần Nginx, Python 3 và curl. **Package manager — trình quản lý gói** cài/ghi nhận phần mềm theo distro; nếu thiếu Nginx, cài nó trong **VM lab riêng**, không yêu cầu cài hoặc dừng Nginx host để học bài.

```bash
command -v nginx
command -v python3
command -v curl
ss -lnt 'sport = :18080 or sport = :18081'
```

`command -v` tìm công cụ; không chứng minh daemon — chương trình chạy phục vụ nền — đang hoạt động. Nếu cổng có listener khác, đổi cặp cổng của lab; không gửi signal cho đối tượng chưa biết.

Trong terminal A:

```bash
proxy_lab=$(mktemp -d)
mkdir -p "$proxy_lab/logs" "$proxy_lab/web"
printf 'backend works\n' > "$proxy_lab/web/index.html"
```

`mktemp -d` tạo thư mục tạm riêng và in đường dẫn; chỉ tiếp tục nếu thành công. Giữ terminal A và biến `proxy_lab` cho suốt lab. Các file/log/PID của bản Nginx thử nằm trong đó.

Tạo file cấu hình bằng block sau; dấu nháy ở `<<'NGINX'` giữ `$host`, `$remote_addr`, `$scheme` để Nginx diễn giải, không để Bash mở rộng chúng:

```bash
cat > "$proxy_lab/nginx.conf" <<'NGINX'
pid nginx.pid;
error_log logs/error.log info;
events { worker_connections 64; }
http {
    access_log logs/access.log;
    client_body_temp_path client-body;
    proxy_temp_path proxy-temp;
    fastcgi_temp_path fastcgi-temp;
    uwsgi_temp_path uwsgi-temp;
    scgi_temp_path scgi-temp;
    server {
        listen 127.0.0.1:18081;
        server_name localhost;
        location / {
            proxy_pass http://127.0.0.1:18080;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 2s;
            proxy_read_timeout 5s;
        }
    }
}
NGINX
```

**Prefix — thư mục nền của Nginx** trong lệnh `-p` quyết định đường dẫn tương đối cho các file của lab. Các đường `*_temp_path` đều đặt tương đối trong prefix để tránh mặc định build distro trỏ vào `/var/lib/nginx`; FastCGI/uWSGI/SCGI là các giao thức nối máy chủ ứng dụng khác, chưa dùng trong lab nhưng vẫn đặt nơi file tạm riêng. `pid` đặt nơi giữ mã process; `error_log` ghi lỗi; `access_log` ghi yêu cầu. **Worker — process làm việc** nhận/xử lý kết nối, `worker_connections` đặt giới hạn đầu giao tiếp của mỗi worker ở mức đủ cho thử nhỏ. `http` chứa cấu hình HTTP, `server` chọn một máy chủ logic, `location /` chọn mọi đường dẫn dưới `/`. `proxy_pass` ở đây không có phần URI mới nên chuyển yêu cầu theo cách phù hợp với cấu hình này; thêm dấu `/`/URI trong cấu hình khác có thể thay cách viết lại đường dẫn. Không sao chép rồi mặc định mọi prefix URL giữ nguyên.

### 3.2. Kiểm tra cấu hình rồi khởi chạy đúng hai process lab

```bash
nginx -p "$proxy_lab/" -c "$proxy_lab/nginx.conf" -t
```

`-t` kiểm tra cú pháp và khả năng mở một số file cấu hình liên quan; không chứng minh backend chạy hoặc bind thật thành công khi khởi động. Chỉ tiếp tục nếu báo thành công. `-c` chọn đúng config lab, không đọc `/etc/nginx/nginx.conf`. Xem [Nginx command-line parameters](https://nginx.org/en/docs/switches.html).

```bash
python3 -m http.server 18080 --bind 127.0.0.1 \
    --directory "$proxy_lab/web" > "$proxy_lab/logs/backend.log" 2>&1 &
backend_pid=$!
nginx -p "$proxy_lab/" -c "$proxy_lab/nginx.conf" -g 'daemon off;' &
proxy_pid=$!
printf 'backend PID=%s; proxy PID=%s; lab=%s\n' \
    "$backend_pid" "$proxy_pid" "$proxy_lab"
```

`&` chạy công việc nền, `$!` là PID công việc nền vừa tạo; lưu ngay. `2>&1` đưa stderr vào cùng log với stdout. `daemon off` giữ Nginx master — process điều phối worker — ở tiến trình đã khởi chạy, thuận tiện chờ bằng Bash thay vì dùng service hệ thống. Cấu hình không cấp root/capability; cổng cao trên loopback phục vụ lab dưới tài khoản thường. Xem [Nginx beginner guide](https://nginx.org/en/docs/beginners_guide.html).

Chờ đến khi thấy hai listener bằng `ss`, đối chiếu process còn sống; nếu chưa có, xem log, không coi lưu được PID là khởi động thành công:

```bash
ss -lnt 'sport = :18080 or sport = :18081'
ps -p "$backend_pid,$proxy_pid" -o pid,ppid,args
curl --noproxy '*' --connect-timeout 2 --max-time 8 --fail http://127.0.0.1:18080/
curl --noproxy '*' --connect-timeout 2 --max-time 8 --fail http://127.0.0.1:18081/
```

`--noproxy '*'` buộc curl đi trực tiếp trong lab, bỏ proxy từ môi trường. **Kết quả minh họa:** cả hai trả `backend works`. Cổng 18080 kiểm chứng backend trực tiếp; 18081 kiểm chứng thêm chặng proxy. Trạng thái `0` của curl với `--fail` và nội dung đúng là bằng chứng tốt hơn chỉ có listener. Log backend có thể bị đệm; dùng curl cùng error/access log để đọc tình trạng. Curl có giới hạn tổng 8 giây ở đây, khác `proxy_read_timeout` 5 giây ở Nginx.

### 3.3. Backend dừng nhưng proxy vẫn sống

Trong terminal A, chỉ dừng PID backend vừa tạo:

```bash
kill -TERM "$backend_pid"
wait "$backend_pid"
curl --noproxy '*' --connect-timeout 2 --max-time 8 -i http://127.0.0.1:18081/
cat "$proxy_lab/logs/error.log"
ss -lnt 'sport = :18080 or sport = :18081'
```

**TERM — tín hiệu yêu cầu kết thúc** làm Python lab thoát; `wait` chờ con và có thể trả 143 trên Linux/Bash thông thường. Curl không dùng `--fail` ở bước lỗi để in response. Kỳ vọng Nginx trả **502 Bad Gateway** và error log có lỗi kết nối upstream như `connect() failed ... Connection refused`; listener 18081 còn, 18080 hết. Mã HTTP 502 cho biết lỗi chặng upstream theo bối cảnh log, không tự nói Nginx process chết.

Nginx cũng có thể trả **504 Gateway Timeout** khi chờ upstream quá hạn trong trường hợp phù hợp. 502/504 là trạng thái lớp HTTP; phải đọc log để phân biệt từ chối kết nối, đóng bất thường, lỗi giao thức hay timeout. Không kết luận firewall từ một status.

Phục hồi đúng backend của lab:

```bash
python3 -m http.server 18080 --bind 127.0.0.1 \
    --directory "$proxy_lab/web" > "$proxy_lab/logs/backend.log" 2>&1 &
backend_pid=$!
```

Đợi listener/backend sẵn sàng rồi thử lại curl qua 18081; kỳ vọng nội dung bình thường. Không cần khởi động lại Nginx chỉ vì backend đã hồi phục trong cấu hình lab này.

### 3.4. Kết thúc và liên hệ service bài 15

Sau khi đọc log, dọn đúng hai process vừa tạo:

```bash
kill -QUIT "$proxy_pid"
wait "$proxy_pid"
kill -TERM "$backend_pid"
wait "$backend_pid"
rm -r -- "$proxy_lab"
```

**QUIT** yêu cầu Nginx shutdown graceful — ngừng nhận việc mới và hoàn tất việc đang xử lý phù hợp — theo cơ chế của Nginx. Chỉ chạy khi PID/đối tượng vẫn đúng; nếu một process đã thoát, đọc kết quả thay vì gửi vào PID cũ. `wait` thu kết quả con của chính shell này. Sau khi cả hai kết thúc mới xóa thư mục tạm. Không dùng `pkill nginx` vì có thể tác động instance khác.

Trên VM bài 15, có thể đặt proxy trước service 8080 bằng cấu hình quản trị của VM. `/etc/nginx/conf.d/*.conf` chỉ có tác dụng nếu config chính thực sự include nó. `nginx -t` không tự áp dụng; `systemctl reload nginx` yêu cầu manager nạp lại dịch vụ đã chạy, còn chưa chạy thì cần start. **systemd** là bộ quản lý service trên hệ dùng nó; hệ khác dùng cách quản lý khác. Không dùng lệnh reload/stop service đó trên host để thay cho lab riêng ở đây.

## 4. Firewall nằm ở đâu trong đường đi packet?

**Packet — gói dữ liệu lớp mạng** chứa thông tin địa chỉ và dữ liệu chuyển đi. **Netfilter — các điểm xử lý/lọc gói trong kernel Linux** cho phép firewall kiểm tra lưu lượng. **Hook — điểm móc xử lý** là nơi luật được gọi trong đường đi. **Input** xử lý gói đến đích cục bộ; **forward** xử lý gói được máy chuyển tiếp sang máy khác; **output** xử lý gói do máy tạo. **Prerouting/postrouting** là điểm trước quyết định định tuyến cho gói vào và trước khi ra interface tương ứng.

```text
Gói từ interface vào -> prerouting -> quyết định đích/route
                                      |
                                      +-> local -> input -> socket ứng dụng
                                      |
                                      +-> chuyển tiếp -> forward -> postrouting -> interface ra

Ứng dụng tạo gói -> định tuyến/output -> postrouting -> interface ra
```

Đọc trái sang phải và theo nhánh quyết định. Sơ đồ khái niệm bỏ qua nhiều chi tiết tái định tuyến; mục tiêu là chọn hook theo nơi ứng dụng/máy chuyển tiếp tham gia. Với client và server cùng loopback, lưu lượng có thể qua đường output rồi input trong cùng namespace; không chỉ là lưu lượng “không qua firewall”. Proxy nhận vào và tự tạo kết nối upstream: nó không biến thành packet forwarding đơn thuần. Xem phần hooks trong [manual nft chính thức](https://netfilter.org/projects/nftables/manpage.html).

**NAT — dịch địa chỉ/cổng** sửa thông tin nguồn hoặc đích tại điểm phù hợp; không đồng nghĩa xác thực hay lọc hoàn chỉnh. **Connection tracking — theo dõi kết nối** giữ trạng thái luồng hai chiều để luật có thể phân loại như `new`, `established`, `related`. **Flow — luồng lưu lượng** là tập gói thuộc cùng trao đổi theo các thông tin liên quan. `established` ở firewall là trạng thái theo dõi mạng, **không có nghĩa người dùng đã đăng nhập hoặc nội dung được phép**. Xem [connection tracking của nftables](https://wiki.nftables.org/wiki-nftables/index.php/Connection_Tracking_System).

## 5. nftables tổ chức rule thế nào và vì sao thứ tự quan trọng?

**nftables** là hệ thống cấu hình quy tắc lọc của Linux; lệnh `nft` quản lý luật. **Table — bảng** gom các chain; **chain — chuỗi luật** chứa **rule — điều kiện và hành động**. **Family — họ xử lý** chọn kiểu lưu lượng: `ip` cho IPv4, `ip6` cho IPv6, `inet` có thể xử lý cả hai. Không mặc định luật chỉ viết cho IPv4 cũng bảo vệ IPv6.

**Base chain — chuỗi gắn với hook** có điểm vào trực tiếp từ Netfilter, cùng **priority — mức thứ tự**; số nhỏ hơn thường được xử lý trước tại cùng hook. **Policy — hành động mặc định của chain** áp dụng khi không có verdict kết thúc trước đó. **Verdict — quyết định** như `accept` hoặc `drop` điều khiển xử lý. `accept` tại một base chain không bảo đảm không bị base chain phía sau drop; `drop` có thể dừng gói. Thứ tự trong chain và giữa chain đều cần đọc. Không dùng priority bằng nhau rồi suy ra thứ tự ổn định giữa các chain. Xem [configuring chains](https://wiki.nftables.org/wiki-nftables/index.php/Configuring_chains).

**Counter — bộ đếm** ghi số gói/byte khớp luật; không tự đổi verdict. Bộ đếm cổng 18081 tăng chứng minh gói qua vị trí đó và khớp điều kiện, không chứng minh mọi chặng ứng dụng thành công. Một request có nhiều packet, nên không dùng counter như số người dùng/yêu cầu. Xem phần counter trong [manual nft chính thức](https://netfilter.org/projects/nftables/manpage.html).

**firewalld/ufw** là công cụ quản lý chính sách có thể sinh luật phía dưới. Không sửa nft trực tiếp xen kẽ với manager đang sở hữu ruleset — tập luật — rồi kỳ vọng thay đổi còn nguyên sau reload. Khi chẩn đoán, xác định công cụ quản lý và đọc trạng thái trước; không chạy `flush ruleset` để thử.

## 6. Lab firewall: đọc trước, counter chỉ ở VM dùng riêng

### 6.1. Phần đọc, không thay đổi luật

Nếu có quyền trên môi trường bạn quản lý:

```bash
sudo nft list ruleset
```

Lệnh chỉ liệt kê, nhưng có thể cần quyền quản trị; thiếu công cụ hoặc `Operation not permitted` không chứng minh không có firewall. Ruleset của namespace hiện tại cũng không cho biết tất cả lớp lọc ngoài VM, như firewall host hoặc thiết bị mạng. Không chia sẻ toàn bộ cấu hình nhạy cảm khi không cần.

Có thể lưu file mẫu `counter-lab.nft` trong thư mục lab để đọc cơ chế:

```nft
table inet linux_course {
    chain input {
        type filter hook input priority 10; policy accept;
        tcp dport 18081 counter
    }
}
```

Đi từ table đến chain: `inet` hỗ trợ hai họ IP, chain ở input, priority 10, không đặt policy drop; luật cuối chỉ đếm TCP có port đích 18081. File tự nó chưa áp dụng gì. `nft -c -f counter-lab.nft` yêu cầu kiểm tra nhưng không commit; vẫn có thể cần quyền/tra trạng thái kernel, không phải parser offline luôn chạy được cho mọi tài khoản. Xem [nft manual](https://netfilter.org/projects/nftables/manpage.html).

### 6.2. Chỉ thực thi trong VM clone có console

**Console — kênh điều khiển trực tiếp VM** giúp truy cập khi SSH lỗi. Chỉ làm trên VM dùng riêng đã có nftables, không có table `linux_course`, không do firewalld/ufw đồng thời quản lý, và bạn biết cách phục hồi VM. Lab không thêm drop, không thay luật SSH, không lưu lâu dài. Trước khi thêm, xác nhận `sudo nft list table inet linux_course` không tìm thấy bảng; lỗi quyền không được coi là “chưa có bảng”.

Khi proxy lab đang nghe 18081 trong chính VM này:

```bash
sudo nft add table inet linux_course
sudo nft 'add chain inet linux_course input { type filter hook input priority 10; policy accept; }'
sudo nft add rule inet linux_course input tcp dport 18081 counter
sudo nft list table inet linux_course
curl --noproxy '*' --connect-timeout 2 --max-time 8 --fail http://127.0.0.1:18081/
sudo nft list table inet linux_course
sudo nft delete table inet linux_course
```

Kiểm tra mỗi lệnh thành công trước khi đi tiếp; nếu lỗi sau khi tạo bảng, chỉ xóa **bảng lab do mình vừa tạo**, không xóa bảng của người khác. Kỳ vọng counter tăng sau curl. Nếu không tăng, kiểm tra đúng namespace/cổng, vị trí chain, các chain trước có thể drop và listener/backend. Ghi cả số trước/sau; không cần một giá trị cố định. Xóa cuối chỉ gỡ cấu hình lab, không phục hồi mọi thay đổi khác; kiểm tra `list table` không còn bảng sau khi gỡ.

**Bài mở rộng chỉ trên VM clone:** thiết kế lọc loopback, established/related, SSH từ subnet quản trị và HTTP theo nhu cầu. Phải có sơ đồ IPv4/IPv6, thử kết nối **mới**, và phương án rollback — quay về cấu hình trước — qua console trước khi áp dụng/persist. Bài không cung cấp một ruleset drop chung để copy lên host; một phiên SSH hiện tại còn sống chưa chứng minh phiên mới sẽ vào được.

## 7. TLS và SSH xác minh điều gì?

Với HTTPS, client cần tên máy đúng, **certificate — chứng chỉ gắn danh tính với khóa công khai**, **trust chain — chuỗi tin cậy** dẫn đến nguồn được client tin, hạn dùng và đồng hồ phù hợp. **Khóa công khai/khóa riêng** là cặp vật liệu mật mã: khóa riêng cần giữ kín, khóa công khai được dùng trong cơ chế xác minh/trao đổi phù hợp. **CA — tổ chức/nguồn chứng thực** ký chứng chỉ theo mô hình tin cậy.

`curl -k` bỏ kiểm tra quan trọng về chứng chỉ nên không là cách sửa lỗi xác minh. Phân biệt tên sai, thiếu CA, hết hạn, đồng hồ sai và lỗi kết nối trước TLS bằng log/công cụ; không đổi tất cả thành “mạng hỏng”. TLS bảo vệ một chặng, không chứng minh backend trả nội dung đúng hoặc user đã được cấp quyền. Nguồn: [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [curl manual](https://curl.se/docs/manpage.html).

**SSH — giao thức truy cập từ xa an toàn** có hai hướng danh tính cần tách. **Host key — khóa máy chủ** giúp client nhận diện server qua cơ chế tin cậy như `known_hosts`; **user key — khóa tài khoản** có thể dùng xác thực người đăng nhập. File `authorized_keys` của tài khoản server chứa khóa được chấp nhận theo chính sách, không thay vai trò của host key. Cảnh báo host key đổi cần xác minh qua kênh đáng tin, không xóa dấu vết rồi mặc định an toàn. Xem [OpenSSH manuals](https://www.openssh.org/manual.html).

Nếu quản trị SSH/firewall trên VM, giữ phiên hiện tại, có console và thử phiên mới từ đúng mạng quản trị trước khi đóng phiên cũ. Đây là cách kiểm chứng khả năng truy cập, không thay cho xác minh danh tính server.

## 8. Lỗi thường gặp và câu hỏi tự kiểm tra

| Dấu hiệu | Cần kiểm tra |
|---|---|
| `nginx -t` thành công nhưng curl không kết nối | Nginx có chạy, bind/cổng đúng, log startup; `-t` không tạo listener |
| Proxy 502, backend trực tiếp lỗi | Backend/listener/error log; proxy có thể vẫn hoạt động |
| Proxy 504 | Giai đoạn chờ upstream và log, không mặc định firewall drop |
| Backend trực tiếp tốt, proxy lỗi | `proxy_pass`, URI, header, quyền/kết nối chặng proxy–backend |
| Counter tăng mà curl lỗi | Gói qua chain chưa chứng minh ứng dụng trả đúng nội dung |
| Header X-Forwarded-For có IP đẹp | Kiểm tra ai được phép gửi/ghi header; không tự là danh tính đáng tin |
| IPv4 được nhưng IPv6 lỗi | Listener/cấu hình socket, route và ruleset từng họ |

1. Nginx trả 502 thì process nào chắc chắn chết? **Đối chiếu:** chưa xác định; cần log, listener backend và kết nối từng chặng, proxy trả được HTTP có thể còn sống.
2. `proxy_read_timeout 5s` có bắt buộc response hoàn tất dưới 5 giây không? **Đối chiếu:** không; đây là thời gian giữa các lần đọc upstream, curl có thể đặt giới hạn tổng khác.
3. `accept` ở base chain đầu có bảo đảm vượt tất cả chain không? **Đối chiếu:** không; đọc hook/priority và chain sau.
4. Firewall đánh dấu established thì tài khoản đã xác thực chưa? **Đối chiếu:** không; trạng thái kết nối mạng khác NSS/PAM hoặc logic đăng nhập ứng dụng.
5. Server nghe `0.0.0.0`, client ngoài không vào được. Điều gì cần thêm? **Đối chiếu:** địa chỉ đúng, route/đường về, firewall các lớp, namespace và trạng thái ứng dụng.
6. Client tự gửi `X-Forwarded-For: 10.0.0.1`. Backend có được dùng làm người gửi thật không? **Đối chiếu:** cần biên tin cậy và quy tắc proxy ghi/kiểm tra, không tin chuỗi tùy ý.
7. HTTPS ngoài proxy có bảo đảm chặng backend HTTPS? **Đối chiếu:** không; kiểm tra cấu hình và mô hình hai kết nối.

Giữ sơ đồ hai kết nối, kết quả curl qua proxy, log khi backend dừng và kết quả phục hồi. Nếu làm firewall VM, giữ counter trước/sau và xác nhận đã gỡ bảng lab. Không tuyên bố đã test firewall khi chỉ đọc file mẫu.

**Mô hình ghi nhớ:** bind chọn nơi nhận; route và firewall quyết định đường gói; reverse proxy tạo một chặng ứng dụng mới; connection tracking không phải xác thực; TLS/SSH xác minh danh tính theo cơ chế riêng. Bài 26 sẽ tách tiếp các lớp tra cứu tài khoản, xác thực và quyền truy cập tài nguyên.

## Nguồn và phạm vi

Nguồn chính thức được gắn tại từng phần: Nginx, nftables/Netfilter, OpenSSH, RFC và Linux man-pages. Đối chiếu `nginx -V`, `nft --version`, `man nft`, `man ssh`, `man sshd_config` trên VM; mặc định socket, module, manager và đường dẫn có thể khác theo build/distro. Lab dùng HTTP loopback và dữ liệu giả, không kiểm chứng cấu hình công khai/TLS/hardening hoàn chỉnh.
