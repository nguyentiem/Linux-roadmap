# Bài 24 — Nền tảng mạng Linux

[Mục lục](../README.md) · [← Bài 23](23-driver-va-io.md) · [Bài 25 →](25-service-firewall.md)

## Mục tiêu: biết kiểm tra lớp nào khi không truy cập được dịch vụ

Giả sử VM A cần đọc trang web từ VM B. Gõ URL bị lỗi: có thể tên chưa được đổi thành địa chỉ, không có đường đi, dịch vụ chỉ nhận kết nối nội bộ, hoặc kết nối đã thành công nhưng trang web không tồn tại. Các nguyên nhân đó nằm ở những lớp khác nhau; đổi DNS không sửa được listener sai địa chỉ.

**VM — máy ảo** là máy tính mô phỏng chạy hệ điều hành riêng. Bài có lab cục bộ dùng một máy Linux và phần mở rộng hai VM cùng mạng thử. Không đổi địa chỉ, route, DNS hay firewall trên máy đang làm việc. Nên đã học bài 15; bài vẫn nhắc khái niệm nền tại chỗ.

Sau bài này, bạn cần giải thích đường đi ứng dụng → TCP/UDP → IP → đường truyền; đọc địa chỉ/prefix, route và neighbor; phân biệt DNS, DHCP và gateway; quan sát socket và hiểu giới hạn của ping/capture. Lab tạo máy chủ HTTP nhỏ chỉ trên loopback, không phụ thuộc Internet hoặc dịch vụ đã có từ bài trước.

## 1. Khi gõ URL, chương trình cần biết những gì?

**URL — địa chỉ tài nguyên** mô tả cách truy cập, tên máy và phần tài nguyên, ví dụ `http://127.0.0.1:18080/index.html`. **HTTP — giao thức trao đổi yêu cầu/kết quả web** quy định client yêu cầu đường dẫn nào và server trả trạng thái/nội dung gì. **Client — bên yêu cầu**, như `curl`; **server — bên phục vụ**, như Python trong lab. **Giao thức** là quy tắc các bên dùng để hiểu dữ liệu gửi/nhận.

**IP address — địa chỉ IP** là địa chỉ ở lớp mạng dùng để xác định đích/nguồn và tìm đường đi. **Port — cổng giao tiếp** là số giúp TCP/UDP chọn đúng đầu giao tiếp trên một địa chỉ, ví dụ `18080` cho server thử và `22` thường dùng SSH. Một số port không tự chứng minh dịch vụ tương ứng đang chạy. **Socket — đầu giao tiếp mà ứng dụng mở** là đối tượng kernel quản lý để nhận/gửi dữ liệu; socket có loại và trạng thái, không phải lỗ cắm vật lý.

**Kernel — nhân hệ điều hành** là phần lõi quản lý CPU, bộ nhớ và giao tiếp thiết bị. **Process — tiến trình** là một lần chương trình đang chạy; process server yêu cầu kernel mở socket. **Bind — gắn socket vào địa chỉ/cổng cục bộ** chọn nơi ứng dụng nhận dữ liệu. Với TCP, **listener — socket chờ kết nối** được đưa vào trạng thái lắng nghe; `ss -lnt` xem các listener TCP.

Địa chỉ `127.0.0.1` thuộc **loopback — đường giao tiếp quay về cùng môi trường mạng**, thường qua interface `lo`. **Interface — giao diện mạng** là điểm kernel gửi/nhận, có thể là card Ethernet thật, Wi-Fi hoặc giao diện ảo. **Network namespace — phạm vi mạng riêng** có tập interface, route và socket riêng; container có thể có namespace khác. Vì vậy `127.0.0.1` trong hai container không mặc định là cùng server. Xem [ip(7)](https://man7.org/linux/man-pages/man7/ip.7.html).

## 2. TCP, UDP, IP và Ethernet chia nhau việc gì?

**TCP** cung cấp luồng byte có thứ tự, truyền lại khi cần và cơ chế điều tiết. **Byte** là đơn vị 8 bit ở đây. TCP phù hợp khi ứng dụng cần dòng dữ liệu đáng tin cậy, như nhiều kết nối HTTP. Nhưng TCP **không giữ ranh giới thông điệp**: gửi hai khối có thể được nhận trong một lần đọc hoặc nhiều lần đọc. Ứng dụng phải có quy tắc riêng để biết một yêu cầu kết thúc ở đâu. Khi lỗi mạng kéo dài, TCP cũng có thể báo thất bại, không cam kết kết nối sống mãi. Xem [tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html).

**UDP** gửi từng **datagram — khối dữ liệu có ranh giới riêng**. Nó không tự cam kết đến nơi, đúng thứ tự hoặc không trùng; ứng dụng phải chọn cơ chế bổ sung nếu cần. “Không có bắt tay TCP” không đồng nghĩa UDP luôn nhanh hơn hoặc không thể có khái niệm phiên ở lớp ứng dụng. Xem [udp(7)](https://man7.org/linux/man-pages/man7/udp.7.html).

**IP** mang dữ liệu thành **packet — gói ở lớp mạng** và cung cấp địa chỉ phục vụ **routing — định tuyến**, tức chọn đường gửi đến đích. **Ethernet** là công nghệ liên kết cục bộ; trên Ethernet, **frame — khung dữ liệu lớp liên kết** chứa packet IP cùng thông tin giao tiếp tại liên kết đó. **MAC address — địa chỉ lớp liên kết** chọn đầu nhận trên liên kết Ethernet; nó không thay địa chỉ IP để tìm đường qua Internet. Chữ MAC ở bài mạng là địa chỉ này, khác cơ chế kiểm soát truy cập bắt buộc cũng viết MAC ở bài 26.

```text
Client muốn GET /index.html
    |
HTTP: cấu trúc yêu cầu web
    |
TCP: dòng byte giữa hai đầu địa chỉ/cổng
    |
IP: địa chỉ đích và route tới đích
    |
Interface/link: đưa dữ liệu qua liên kết tiếp theo
    |
Server: giải ngược các lớp, đọc yêu cầu và trả kết quả
```

Đọc từ trên xuống: lớp trên giao dữ liệu cho lớp dưới, mỗi lớp giải quyết một trách nhiệm. Đây là sơ đồ HTTP chạy trên TCP của lab; không phải mọi HTTP hiện đại đều chạy trực tiếp trên TCP. Với loopback không cần card Ethernet hay ARP cho một máy bên ngoài. Nếu đi qua router — thiết bị/hệ thống chuyển packet giữa các mạng — thông tin liên kết thay đổi qua từng chặng, còn IP đích phục vụ đường đi toàn tuyến trừ khi cơ chế dịch địa chỉ can thiệp.

## 3. `/24` nói gì và gateway được dùng lúc nào?

**IPv4** là phiên bản IP dùng địa chỉ 32 bit, thường viết bốn số như `192.168.50.10`. **Prefix — phần đầu địa chỉ xác định mạng** viết bằng số bit giữ làm phần mạng. `192.168.50.10/24` có 24 bit phần mạng; **subnet — mạng con** tương ứng là `192.168.50.0/24`. **Subnet mask — mặt nạ mạng con** cho biết các bit mạng, `/24` tương ứng `255.255.255.0`.

Ví dụ minh họa một VM B có `192.168.50.10/24`: đích `192.168.50.20` thường được coi là cùng liên kết với route trực tiếp phù hợp; đích `198.51.100.20` không thuộc prefix đó. Không gán các địa chỉ ví dụ lên máy thật: mạng VM của bạn có thể khác, và `198.51.100.0/24` là vùng địa chỉ tài liệu.

**Route — bản ghi đường đi** cho biết prefix đích, interface ra và có thể có **next hop — chặng kế tiếp**. **Gateway — nút chuyển tiếp** là một next hop để đi đến mạng khác. **Default route — đường mặc định** dùng khi không có route cụ thể phù hợp hơn trong lượt tra cứu đó; với IPv4 thường viết `default` hoặc `0.0.0.0/0`.

```text
VM A: 192.168.50.11/24
  route 192.168.50.0/24 -> gửi trực tiếp trên ens3
  route default       -> next hop 192.168.50.1 trên ens3

Đến 192.168.50.10 -> chọn route /24, tìm neighbor VM B
Đến mạng ngoài   -> chọn default nếu phù hợp, tìm neighbor gateway
```

Hai dòng route là mô hình minh họa, không là cấu hình đã quan sát. **Longest-prefix match — chọn prefix khớp dài nhất** nghĩa là route cụ thể hơn được ưu tiên **trong bảng đang tra cứu**. Không viết thành “luôn chọn /24 trước mọi quy tắc”: Linux có **policy routing — định tuyến theo quy tắc**, có thể dùng nguồn, dấu đánh dấu hoặc tiêu chí khác để chọn bảng trước. Khi nhiều route tương đương, thuộc tính như **metric — chi phí/độ ưu tiên route** cũng có vai trò. Xem [ip-route(8)](https://man7.org/linux/man-pages/man8/ip-route.8.html) và [ip-rule(8)](https://man7.org/linux/man-pages/man8/ip-rule.8.html).

Tự kiểm tra bằng `ip route`, `ip rule` và `ip route get DIA_CHI_DICH`, thay giá trị giữ chỗ bằng IP thật. `route get` hỏi kernel cách định tuyến cho truy vấn đó; nó không gửi thử packet và không chứng minh đích phản hồi. Trên máy có nhiều địa chỉ/đường đi, cần xét nguồn và thông số thật của kết nối, không chỉ đích.

## 4. IP biết đường rồi, tại sao còn cần ARP/neighbor?

**Neighbor — đầu giao tiếp lân cận** là đầu trên liên kết trực tiếp mà kernel cần gửi frame đến. **ARP** tìm địa chỉ MAC tương ứng một IPv4 trên liên kết dùng ARP. Nếu gửi đến VM B cùng liên kết, cần MAC của B; nếu gửi ra ngoài mạng qua gateway, thường cần MAC gateway, không phải MAC của server Internet.

Ví dụ `ip neigh` có thể hiện:

```text
192.168.50.1 dev ens3 lladdr 52:54:00:12:34:56 REACHABLE
```

`dev ens3` là interface, `lladdr` là địa chỉ liên kết, `REACHABLE` là trạng thái xác nhận gần đây. `STALE` không tự nghĩa hỏng: thông tin đã cũ và có cơ chế kiểm tra lại khi dùng. `FAILED` gợi ý không tìm/kiểm chứng được neighbor trong lần đó; hãy đối chiếu liên kết, địa chỉ và VM cùng mạng. Bảng rỗng sau chỉ thử loopback là bình thường; loopback không cần ARP như Ethernet. Xem [arp(7)](https://man7.org/linux/man-pages/man7/arp.7.html).

**IPv6** dùng địa chỉ 128 bit, viết như `::1` cho loopback. **Link-local — địa chỉ chỉ có phạm vi liên kết** thường thuộc `fe80::/10`; khi đích có thể tồn tại trên nhiều interface, cần chỉ rõ interface/phạm vi, ví dụ `fe80::1%ens3` trong công cụ hỗ trợ cú pháp đó. **Neighbor Discovery — cơ chế khám phá lân cận IPv6** dùng **ICMPv6 — giao thức thông báo/điều khiển IPv6** để làm các việc như tìm neighbor/router. Nó không đơn giản là ARP với địa chỉ dài hơn. Xem [ipv6(7)](https://man7.org/linux/man-pages/man7/ipv6.7.html) và [RFC 4861](https://www.rfc-editor.org/rfc/rfc4861).

IPv4 hoạt động không bảo đảm IPv6 hoạt động: địa chỉ, route, listener và luật lọc có thể khác. Không chặn toàn bộ ICMPv6 rồi kỳ vọng mạng vẫn đầy đủ chức năng; một số thông điệp phục vụ vận hành đường truyền. Lab chính dùng IPv4 rõ ràng, còn `ip -6 route` để nhận diện trạng thái IPv6.

## 5. DNS, DHCP và default gateway có phải một thứ?

**DNS — hệ thống tên miền** lưu bản ghi tra cứu tên, ví dụ đổi `example.com` thành địa chỉ. **Record — bản ghi DNS** có loại: `A` chứa IPv4, `AAAA` chứa IPv6; DNS còn nhiều loại khác nên không chỉ là bảng tên→IP. **Resolver — bộ phận giải tên** thực hiện truy vấn và có thể dùng **cache — bộ đệm giữ kết quả để dùng lại**. Một tên có thể có nhiều địa chỉ và kết quả thay đổi theo thời gian. Xem [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034).

**DHCP — giao thức cấp cấu hình mạng động** có thể cung cấp địa chỉ, mặt nạ, gateway và thông tin DNS theo cấu hình server. **Lease — quyền dùng địa chỉ có thời hạn** được client nhận/gia hạn. DHCP không phải thao tác mà mọi lần mở URL đều phải thực hiện. Máy có cấu hình địa chỉ tĩnh không nhất thiết dùng DHCP. IPv6 còn có cơ chế tự cấu hình và DHCPv6 khác với DHCP IPv4; không suy từ lab IPv4 sang mọi mạng IPv6. Xem [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131).

**Default gateway** giúp chuyển packet ra ngoài mạng trực tiếp. **DNS server** trả lời thông tin tên. Chúng có thể cùng một thiết bị ở mạng gia đình nhưng là hai trách nhiệm; DNS lỗi có thể làm tên thất bại dù địa chỉ IP vẫn kết nối được. Tuy nhiên thử một IP bất kỳ thay hostname cho HTTPS có thể lỗi chứng chỉ hoặc chọn sai website: ứng dụng vẫn cần tên đúng. Kết luận phải tách lớp mạng khỏi yêu cầu của ứng dụng.

Trên nhiều distro dùng glibc, ứng dụng có thể đi qua **NSS — cơ chế chọn nguồn tra cứu tên/thông tin hệ thống** theo `/etc/nsswitch.conf`, ví dụ đọc `/etc/hosts` rồi DNS. `getent ahosts localhost` đi qua cơ chế tra cứu ấy; `dig example.com` là công cụ truy vấn DNS và không tự mô phỏng toàn bộ đường NSS. Ứng dụng dùng resolver riêng cũng có thể khác. Xem [nsswitch.conf(5)](https://man7.org/linux/man-pages/man5/nsswitch.conf.5.html) và [manual dig của BIND](https://bind9.readthedocs.io/en/latest/manpages.html#dig-dns-lookup-utility).

`/etc/resolv.conf` có thể là file do bộ quản lý tạo hoặc **symlink — liên kết trỏ sang đường dẫn khác**. NetworkManager quản lý kết nối, còn systemd-resolved có thể cung cấp dịch vụ giải tên và DNS theo từng liên kết; có máy dùng thành phần khác hoặc phối hợp cả hai. Một dòng `nameserver 127.0.0.53` có thể trỏ đến resolver cục bộ, không có nghĩa đó là địa chỉ DNS bên ngoài. Đọc `ls -l /etc/resolv.conf`, `cat /etc/resolv.conf`; nếu môi trường thực sự chạy resolved, xem `resolvectl status`. Có lệnh `resolvectl` chưa chứng minh dịch vụ đang hoạt động. Không sửa tay rồi coi thay đổi là bền vững; có thể bị quản lý ghi đè. Nguồn: [NetworkManager.conf](https://networkmanager.dev/docs/api/latest/NetworkManager.conf.html), [mã tài liệu chính thức systemd-resolved](https://github.com/systemd/systemd/blob/main/man/systemd-resolved.service.xml).

## 6. Lab 1: quan sát các lớp, không đổi cấu hình mạng

**Terminal — cửa sổ giao tiếp văn bản** hiển thị lệnh/kết quả. **Shell — chương trình đọc và thực hiện lệnh**, ở đây dùng Bash. Mở terminal và chạy từng lệnh:

```bash
ip -br link
ip -br addr
ip route
ip -6 route
ip rule
ip neigh
ss -lnt
getent ahosts localhost
```

`-br` là hiển thị ngắn. Với `link`, xem tên interface, trạng thái và địa chỉ liên kết; **UP** trong cờ quản trị nghĩa interface được bật, không đủ chứng minh dây/Wi-Fi/đích sẵn sàng. Với `addr`, xem IPv4/IPv6 cùng prefix; tên interface có thể là `enp...`, `ens...`, `wlp...`, không mặc định `eth0`. `lo` có thể hiện trạng thái liên kết `UNKNOWN` dù loopback hoạt động bình thường. Xem [ip-link(8)](https://man7.org/linux/man-pages/man8/ip-link.8.html) và [ip-address(8)](https://man7.org/linux/man-pages/man8/ip-address.8.html).

Trong `ip route`, tìm `default via ... dev ...` nếu cần ra ngoài mạng; không có default chưa ngăn kết nối loopback/cùng mạng. `ip -6 route` là bảng IPv6 riêng. `ip rule` giúp biết có định tuyến ngoài cấu hình đơn giản hay không. `ip neigh` chỉ nói về neighbor, không phải danh sách mọi server bạn có thể truy cập.

Với `ss -lnt`: `-l` chọn socket lắng nghe, `-n` giữ địa chỉ/cổng dạng số, `-t` chọn TCP. Xem `Local Address:Port`; `127.0.0.1:18080` khác `0.0.0.0:18080`. Thêm `-p` để xem process khi quyền cho phép: `ss -lntp`. Thiếu tên process không tự nghĩa socket không có chủ sở hữu. Đây là snapshot — ảnh chụp một thời điểm — không xác nhận ứng dụng trả dữ liệu đúng. Xem [ss(8)](https://man7.org/linux/man-pages/man8/ss.8.html).

Lab giải tên ở đây dùng `localhost`, không cần Internet. Khi được phép truy vấn mạng bên ngoài, có thể so `getent ahosts example.com` với `dig example.com`: đọc trạng thái DNS, phần trả lời, địa chỉ server truy vấn và thời gian; kết quả khác nhau có thể do NSS, cache hoặc cách cấu hình từng liên kết. Không yêu cầu hai công cụ luôn cho cùng số dòng.

## 7. Lab 2: một server cục bộ để kiểm chứng listener và HTTP

Cần Python 3 và curl. Trong terminal A, chọn thư mục tạm riêng và cổng chưa dùng:

```bash
lab_dir=$(mktemp -d)
printf 'network lab\n' > "$lab_dir/index.html"
python3 -m http.server 18080 --bind 127.0.0.1 --directory "$lab_dir"
```

`mktemp -d` tạo thư mục tạm và in đường dẫn, biến `lab_dir` giữ nó. Chỉ tiếp tục nếu thành công. **Module Python** là nhóm chức năng, `-m http.server` chạy module máy chủ HTTP. `--bind` giữ server chỉ ở loopback; `--directory` chỉ định đúng dữ liệu phục vụ, tránh vô tình công bố thư mục cá nhân. Đây là server lab, không có thiết kế bảo mật/vận hành cho dịch vụ công khai. Python cần hỗ trợ `--directory` (từ 3.7). Xem [Python http.server](https://docs.python.org/3/library/http.server.html).

Nếu báo `Address already in use`, có đối tượng khác giữ cổng. Không dừng đối tượng đó; chọn cổng khác như `18090` và thay **mọi** lệnh/capture tương ứng. Đợi dòng server đã chạy trước khi thử.

Trong terminal B:

```bash
ss -lnt 'sport = :18080'
curl --noproxy '*' --connect-timeout 2 --max-time 5 --fail http://127.0.0.1:18080/
printf 'curl status=%s\n' "$?"
curl --noproxy '*' --connect-timeout 2 --max-time 5 -i http://127.0.0.1:18080/missing-file
```

**Proxy — bên trung gian chuyển yêu cầu** có thể được curl chọn từ biến môi trường; `--noproxy '*'` yêu cầu bỏ proxy cho mọi đích của lệnh lab để thử trực tiếp. `--connect-timeout` giới hạn giai đoạn kết nối, `--max-time` giới hạn tổng thời gian. `--fail` làm nhiều trạng thái HTTP lỗi trả mã lỗi curl thay vì coi việc nhận trang lỗi là thành công; `-i` in cả **header — phần thông tin đầu thông điệp HTTP** và nội dung.

Kỳ vọng lần đầu trả `network lab` và status `0`. Lần `/missing-file` có thể trả `HTTP/1.0 404 File not found`; **404** nghĩa server đã nhận yêu cầu nhưng không tìm tài nguyên. Không dùng `--fail` ở lần này để dễ đọc nội dung lỗi; curl có thể trả `0` dù HTTP là 404, vì truyền tải đã hoàn tất. Mã shell của curl và trạng thái HTTP là hai lớp. Xem [curl manual](https://curl.se/docs/manpage.html).

So với service `127.0.0.1:8080` ở bài 15, lab này chọn cổng khác để không tác động service đó. VM khác truy cập IP của máy vào `18080` không dùng được listener chỉ bind `127.0.0.1`; đây là ranh giới đã chọn, không tự là lỗi route.

Kết thúc: ở terminal A nhấn `Ctrl+C` để Python thoát, rồi dọn đúng thư mục vừa tạo:

```bash
rm -r -- "$lab_dir"
```

Chỉ chạy trong terminal A còn giữ `lab_dir` đúng; `--` kết thúc phần tùy chọn. `ss` ở terminal B không còn listener mới nếu cổng chưa được process khác dùng lại.

## 8. Lab 3: nhìn gói loopback và đọc quá trình kết nối

**Packet capture — ghi lại gói được quan sát** dùng công cụ như `tcpdump`. Capture cần quyền theo cấu hình hệ thống; phần này tùy chọn, không đổi firewall hay cấp capability cho binary. Chỉ quan sát loopback/cổng lab, không ghi lưu lượng của người khác.

Khi server mục 7 đang chạy, terminal B chạy:

```bash
sudo timeout 10s tcpdump -ni lo -c 20 'tcp port 18080'
```

Nếu không được cấp quyền hoặc chưa có công cụ, bỏ phần chạy và đọc mô hình dưới. `-n` giữ địa chỉ/cổng số, `-i lo` chọn interface loopback, `-c 20` kết thúc sau 20 gói; `timeout 10s` giới hạn thời gian nếu chưa đủ gói. **Filter — điều kiện lọc capture** ở đây chọn TCP cổng 18080. `timeout` có thể trả 124 vì hết 10 giây, không tự nghĩa HTTP lỗi.

Terminal C tạo đúng một truy vấn:

```bash
curl --noproxy '*' --connect-timeout 2 --max-time 5 --fail http://127.0.0.1:18080/
```

Ví dụ các dấu TCP có thể thấy:

```text
client-port > 18080: Flags [S]       SYN
18080 > client-port: Flags [S.]     SYN + ACK
client-port > 18080: Flags [.]      ACK
client-port > 18080: Flags [P.]     có dữ liệu, xác nhận
... dữ liệu trả về ...
... Flags [F.] và ACK ...           đóng bình thường
```

**SYN** khởi tạo đồng bộ kết nối, **ACK** xác nhận thông tin đã nhận, **FIN** biểu thị một phía hết dữ liệu để gửi; đóng kết nối hai chiều có thể hiện thành nhiều gói. `client-port` là cổng tạm do kernel chọn cho client, không chép nguyên vào lệnh. `P` là cờ PUSH, không tự xác định ranh giới yêu cầu HTTP. Một phiên có thể kết thúc bằng **RST — reset**, ví dụ đích từ chối hoặc ngắt bất thường; phải đọc bối cảnh, không coi mọi reset là lỗi firewall.

Một dòng capture không tương ứng một thông điệp HTTP. **Segmentation — chia dữ liệu TCP thành các đoạn** và **coalescing — gom dữ liệu khi xử lý** làm số đoạn khác số lần ghi/đọc ứng dụng. **Offload — giao một phần xử lý cho phần cứng/đường tăng tốc kernel** cũng ảnh hưởng cách gói xuất hiện ở điểm capture; checksum hiển thị bất thường tại một điểm quan sát chưa đủ chứng minh gói hỏng trên đường truyền. Xem [tcpdump manual](https://man7.org/linux/man-pages/man1/tcpdump.1.html).

Bài chỉ cần nhận diện bắt tay, dữ liệu và đóng/đặt lại kết nối, cùng chiều địa chỉ/cổng. Không cần số packet cố định; hệ điều hành và phiên bản server có thể thay đổi cách chia/gom dữ liệu.

## 9. Mở rộng hai VM: nhìn đường đi trước khi kết nối

Dùng hai VM cùng mạng lab đã cấu hình, có quyền quan sát; không đổi mạng host. Vẽ A, B, interface và IP/prefix thực. Trên B ghi `ip -br addr`; trên A đặt địa chỉ thật:

```bash
peer_ip=192.168.50.10
ip route get "$peer_ip"
ip neigh
```

Giá trị trên là minh họa, phải thay. Đọc `dev`, `via` nếu có và `src` trong kết quả route; `src` là nguồn kernel dự định dùng. Muốn thử HTTP liên máy, cần một server được chủ đích cho nhận trên IP lab của B và luật mạng cho phép. Server loopback ở mục 7 không đáp ứng điều kiện này; không đổi nó sang `0.0.0.0` chỉ để làm phép thử thông qua trên máy làm việc.

Nếu có dịch vụ thử được phép trên B, dùng curl trực tiếp đến IP/cổng thật ở A và đối chiếu listener của B. **Ping** dùng **ICMP — thông báo/kiểm tra lớp IP**; ping thành công không xác nhận HTTP/TCP hay đúng port, ping thất bại có thể chỉ do ICMP bị lọc. Có thể dùng capture hai phía trong VM lab để xem packet có đến và trả về hay không, thay vì tắt lọc toàn bộ.

## 10. Lỗi thường gặp: chọn giả thuyết rồi tìm bằng chứng

| Dấu hiệu | Bước kiểm tra tiếp | Chưa được kết luận |
|---|---|---|
| Interface chưa bật/không có địa chỉ mong đợi | `ip -br link`, `ip -br addr`, quản lý mạng của distro | Không mặc định DHCP hỏng trên máy dùng địa chỉ tĩnh |
| `Network unreachable` | `ip route get`, `ip rule`, phạm vi mạng đang chạy | Chưa biết server có sống hay không |
| `Connection refused` | Listener đúng địa chỉ/cổng, reset/reject chủ động | Có thể không listener hoặc lọc từ chối; không luôn là một nguyên nhân |
| Kết nối hết thời gian | Capture hai chiều, route về, lọc, tải ứng dụng | Chưa chứng minh firewall drop |
| Tên lỗi nhưng IP kết nối được | NSS/resolver, DNS, tên đầy đủ và môi trường ứng dụng | Không dùng thử IP để bỏ kiểm tra tên HTTPS |
| TCP kết nối được nhưng HTTP 404 | URL, thư mục phục vụ, log server | Không phải bằng chứng thiếu route/DNS |

**Firewall — bộ lọc lưu lượng** áp dụng quy tắc cho phép/từ chối, học kỹ ở bài 25. **Drop — bỏ gói không trả lời** khác **reject — từ chối có phản hồi**; do đó timeout và refused không diễn giải giống nhau. Không tắt firewall để thay cho kiểm tra theo lớp.

## 11. Tự kiểm tra và sản phẩm cần giữ

1. B có listener `127.0.0.1:18080`, A đã ping được IP B. A dùng HTTP vào IP B có chắc thành công? **Đối chiếu:** không; listener chỉ nhận loopback trong namespace B.
2. A đến server ngoài subnet, cần ARP cho IP server hay gateway? **Đối chiếu:** với route qua gateway trên Ethernet, neighbor cần là chặng tiếp theo, không mặc định đích cuối.
3. `ip route get` trả route hợp lệ nhưng curl timeout. Có đủ kết luận firewall drop? **Đối chiếu:** chưa; route là quyết định cục bộ, cần listener, đường về, lọc và capture/tình trạng ứng dụng.
4. `getent` tìm tên nhưng `dig` không có cùng kết quả. Mâu thuẫn không? **Đối chiếu:** có thể khác nguồn NSS, cache và đường resolver; hai công cụ không làm cùng phép thử.
5. Curl nhận 404 mà mã shell 0. Có mạng hoạt động không? **Đối chiếu:** đã trao đổi HTTP với server; mã HTTP và mã công cụ khác nhau, `--fail` thay cách báo lỗi cho script.
6. TCP nhận dữ liệu bằng hai lần đọc, ứng dụng đã gửi một yêu cầu. Có lỗi TCP? **Đối chiếu:** không; TCP giữ luồng byte, ứng dụng tự xác định ranh giới thông điệp.
7. IPv4 curl được, IPv6 không được. Kiểm tra gì? **Đối chiếu:** địa chỉ/route IPv6, listener IPv6 và lọc tương ứng; không xem IPv4 là bằng chứng cho cả hai.

Giữ một sơ đồ các lớp, ảnh/lệnh đọc listener và kết quả curl thành công/lỗi HTTP. Nếu làm hai VM, bổ sung IP/prefix thật và route đến peer; nếu capture được, chú thích chiều SYN/SYN-ACK/ACK và dữ liệu. Không chép số ví dụ như quan sát máy mình.

**Tự nhắc mô hình:** tên được giải theo cơ chế ứng dụng; địa chỉ và route đưa packet đến nơi; TCP/UDP chọn đầu giao tiếp; listener và HTTP quyết định dịch vụ trả gì. Kiểm chứng từng lớp bằng đúng công cụ và đúng namespace. Bài 25 thêm proxy và firewall để giải thích vì sao một yêu cầu có thể đi qua hai kết nối riêng.

## Nguồn và đối chiếu môi trường

Nguồn được gắn cạnh nội dung là Linux man-pages, RFC và tài liệu chính thức của công cụ. Tra bản cài bằng `man ip`, `man 7 tcp`, `man 7 udp`, `man 7 ipv6`, `man ss`, `man tcpdump`, `curl --help all`. BusyBox, libc khác, distro quản lý mạng khác hoặc container có thể cho cú pháp/kết quả khác; luôn ghi môi trường trước khi so số liệu.
