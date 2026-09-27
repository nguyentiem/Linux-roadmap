# Bài 11 — Package, repository và thư viện

[Mục lục](../README.md) · [← Bài 10](10-user-va-phan-quyen.md) · [Bài 12 →](12-process-thread-signal.md)

## Mục tiêu

Bạn đã biết chạy lệnh và kiểm tra quyền. Bài này trả lời câu hỏi tiếp theo: lệnh trên máy đến từ đâu, ai quản lý file của nó và vì sao file chương trình đã tồn tại nhưng vẫn không chạy được?

Tình huống xuyên suốt là chuẩn bị một VM Debian/Ubuntu để chạy Python và biên dịch chương trình C nhỏ. Bạn sẽ lần từ tên lệnh → đường dẫn → package sở hữu → phiên bản/nguồn → thư viện cần khi chạy.

Sau bài, bạn cần:

- Phân biệt gói phần mềm, kho gói, metadata và các công cụ quản lý gói.
- Giải thích `apt update` khác cài/nâng cấp; đọc kế hoạch thay đổi trước khi thực hiện.
- Tìm gói sở hữu file, phân biệt đường dẫn liên kết với file đích và công cụ cài thủ công.
- Hiểu đường khởi chạy một executable, dynamic linker, shared library và tương thích ABI.
- Phân biệt tìm chương trình bằng PATH với tìm thư viện; biết giới hạn và rủi ro của các phép kiểm tra.
- Ghi nhận trạng thái trước thay đổi, kiểm tra sau thay đổi và thiết kế rollback tính cả cấu hình/dữ liệu.

**Điều kiện:** đã học bài 02, 07–10. Lab cài công cụ dành cho **VM (máy ảo)** Debian/Ubuntu có mạng và quyền `sudo`; VM là máy thực hành riêng chạy trên một máy chủ. `sudo` chạy lệnh bằng danh tính được chính sách cho phép, thường là root để sửa hệ thống. Phần tra cứu và phân tích file phần lớn chỉ đọc thông tin, không cần sudo. Không chạy cả nhánh Debian và RPM để hoàn thành bài.

Đầu ra ghi **minh họa** chỉ mô tả hình dạng và kết quả dự kiến; số phiên bản, kiến trúc, đường dẫn thư viện và kế hoạch cài thực tế tùy máy. Tài liệu trực tuyến có thể mới hơn bản công cụ đã cài, nên xem phiên bản và hướng dẫn địa phương khi tùy chọn khác.

## 1. Vì sao không chỉ tải một file chương trình rồi chép vào máy?

### 1.1. Package gồm những gì?

**Package (gói phần mềm)** là đơn vị cài đặt có tên, phiên bản, thông tin điều kiện và các file cần triển khai. Trên Debian/Ubuntu, gói nhị phân thường là file `.deb`; trên họ RPM, thường là `.rpm`. **Gói nhị phân** là gói đã chứa các thành phần để cài/dùng, khác **gói mã nguồn** chứa nguồn và thông tin phục vụ xây dựng gói. Một gói nhị phân không nhất thiết chỉ có mã máy: nó có thể chứa script, tài liệu, dữ liệu hoặc cấu hình.

Ví dụ một gói có thể cung cấp `/usr/bin/curl`, trang hướng dẫn và thông tin phụ thuộc. **Executable (file thực thi)** là file được chạy như chương trình; một gói có thể chứa nhiều executable, hoặc không có executable nào. Ngược lại, một ứng dụng hoàn chỉnh có thể được chia thành nhiều gói.

**Metadata (dữ liệu mô tả)** là thông tin về gói: tên, phiên bản, kiến trúc, các gói phụ thuộc, mô tả và danh sách file. **Architecture (kiến trúc)** là loại nền tảng mã máy/gói nhắm tới, ví dụ AMD64 hoặc ARM64. Gói có tên giống nhau nhưng khác kiến trúc không mặc định dùng được cho cùng CPU.

```bash
dpkg --print-architecture
apt-cache show python3
```

`dpkg --print-architecture` xem kiến trúc gói chính của hệ Debian. `apt-cache show` xem metadata gói trong dữ liệu APT đang có; chú ý `Package`, `Version`, `Architecture`, `Depends`, `Description`. `Architecture: all` nghĩa gói không dành riêng cho một kiến trúc theo cách đóng gói, không có nghĩa nó độc lập với mọi phiên bản Python/hệ điều hành.

### 1.2. Dependency là gì, vì sao cài một gói có thể kéo nhiều gói?

**Dependency (phụ thuộc)** là điều kiện mà gói cần để cài hoặc hoạt động, chẳng hạn có thư viện cùng phiên bản tối thiểu. **Library (thư viện)** là tập mã dùng lại được, giúp nhiều chương trình sử dụng một chức năng chung thay vì mỗi chương trình tự viết lại.

Sơ đồ dưới là mô hình, không phải danh sách phụ thuộc cố định của một phiên bản cụ thể:

```text
Gói chương trình cần dùng
       |
       +-> gói thư viện xử lý dữ liệu
       |       |
       |       +-> gói thư viện nền
       |
       +-> gói dữ liệu/cấu hình cần thiết
```

Mũi tên có nghĩa “cần điều kiện từ gói bên phải/bên dưới”, không phải file trên đĩa được chứa bên trong gói cha. Quản lý gói phải chọn một tập phiên bản đáp ứng cả hệ thống. Một gói yêu cầu thư viện mới, trong khi gói khác chưa tương thích thư viện ấy, có thể tạo **dependency conflict (xung đột phụ thuộc)**.

```bash
apt-cache depends python3
apt-cache depends build-essential
```

Đọc `Depends` như điều kiện cần; có thể có lựa chọn thay thế. **Recommends** là quan hệ khuyến nghị mạnh mà APT thường cài theo mặc định, không đồng nhất với Depends; **Suggests** là gợi ý thêm. Danh sách này mô tả quan hệ gói, không phải mọi file thư viện mà một tiến trình sẽ mở khi chạy.

`build-essential` trên Debian/Ubuntu là gói tập hợp điều kiện/công cụ xây dựng cơ bản, thường gồm trình biên dịch và công cụ tạo chương trình. Nó không bảo đảm dự án bất kỳ có đủ mọi dependency: dự án dùng một thư viện ngoài còn cần gói phát triển tương ứng. Xem [Debian FAQ: package basics](https://www.debian.org/doc/manuals/debian-faq/pkg-basics.en.html).

## 2. Repository → APT → dpkg → file trên máy

### 2.1. Repository là kho gói, không phải các gói đã cài

**Repository (kho gói)** là nguồn cung cấp gói và chỉ mục mô tả những gói có sẵn. **Release** là một bản phát hành của distro; **distro (bản phân phối)** là hệ Linux hoàn chỉnh kết hợp kernel, công cụ và chính sách cập nhật. Debian và Ubuntu có kho/chu kỳ phát hành khác nhau dù cùng dùng định dạng `.deb`.

**Package manager (trình quản lý gói)** quản lý cài, nâng cấp, gỡ và theo dõi trạng thái gói. Trên Debian/Ubuntu:

- **APT** là hệ công cụ tra kho, chọn phiên bản, giải quyết phụ thuộc và tải gói. `apt` là giao diện tiện cho người dùng tương tác; `apt-get`, `apt-cache` là các công cụ chuyên biệt, thường phù hợp hơn để viết script có yêu cầu giao diện ổn định.
- **dpkg** thực hiện công việc cài/giải nén/cấu hình gói và giữ cơ sở dữ liệu gói cục bộ. `dpkg-query` đọc thông tin từ cơ sở dữ liệu ấy.

```text
Kho được cấu hình
   |
   | apt update: tải và kiểm tra chỉ mục
   v
Dữ liệu kho trên máy -----> APT chọn phiên bản + giải phụ thuộc
                                      |
                                      | tải gói đã chọn
                                      v
                             dpkg triển khai/cấu hình
                                      |
                                      v
                             File + trạng thái gói
                                      |
                                      | chạy chương trình (việc khác)
                                      v
                             Tiến trình đang hoạt động
```

Đọc từ trên xuống: biết một gói trong kho chưa có nghĩa đã tải; tải chưa có nghĩa đã cấu hình thành công; đã cài chưa có nghĩa dịch vụ đang chạy. **Process (tiến trình)** là chương trình đang thực thi với tài nguyên và trạng thái riêng. Một dịch vụ có thể được script của gói khởi chạy trong lúc cài, nhưng không phải mọi gói đều có hoặc chạy dịch vụ.

**Script** là file chứa các lệnh/mã để một bộ diễn giải thực hiện, ví dụ chuỗi lệnh shell. **Maintainer script** là script đi kèm gói để chuẩn bị/hoàn tất cài, nâng cấp hoặc gỡ; nó có thể chạy với quyền quản trị, tạo user hay thay đổi trạng thái dịch vụ. Cài gói vì vậy không chỉ là chép byte. **Byte** là đơn vị 8 bit dùng để biểu diễn dữ liệu; các file chứa mã, chữ hay cấu hình đều có thể xem như dãy byte ở tầng lưu trữ. Xem [Debian FAQ: package tools](https://www.debian.org/doc/manuals/debian-faq/pkgtools.en.html) và [dpkg(1)](https://manpages.debian.org/trixie/dpkg/dpkg.1.en.html).

### 2.2. `update`, `install`, `upgrade` thay đổi những lớp nào?

| Thao tác APT | Điều cần hiểu trước khi chạy |
|---|---|
| `apt update` | Làm mới dữ liệu kho đã cấu hình; không nâng phiên bản executable chỉ vì cập nhật chỉ mục |
| `apt install tên-gói` | Cài hoặc nâng gói được yêu cầu cùng các thay đổi phụ thuộc cần thiết |
| `apt upgrade` | Nâng các gói theo quy tắc của `apt`; có thể thêm gói cần thiết nhưng không gỡ gói đã có để giải quyết nâng cấp |
| `apt full-upgrade` | Có thể gỡ gói khi cần để giải thay đổi phụ thuộc; phải đọc kế hoạch kỹ |
| `apt remove tên-gói` | Gỡ gói, thường giữ các file cấu hình do cơ chế gói quản lý |
| `apt purge tên-gói` | Gỡ cả phần cấu hình thuộc phạm vi purge của gói; không bảo đảm xóa mọi dữ liệu người dùng/dịch vụ |
| `apt autoremove` | Đề xuất gỡ các gói tự động không còn cần theo cơ sở dữ liệu phụ thuộc |

Không chạy cả bảng để thử. Đây là bản đồ tác động để đọc hướng dẫn và chọn lệnh đúng. `apt-get upgrade` có quy tắc khác `apt upgrade` về việc thêm gói mới trong cách dùng mặc định; không mặc định hai giao diện có cùng mọi hành vi. `full-upgrade` cũng không tự là toàn bộ quy trình chuyển sang release distro mới.

Sau `update`, APT vẫn có thể chưa có thông tin mới từ một nguồn lỗi và giữ dữ liệu cũ. Đọc cả cảnh báo và kết quả, không chỉ dòng cuối. `apt-cache` dùng dữ liệu cục bộ nên có thể tra offline, nhưng không chứng minh kho trực tuyến hiện đang tải được. Xem [apt(8)](https://manpages.debian.org/trixie/apt/apt.8.en.html), [apt-get(8)](https://manpages.debian.org/trixie/apt/apt-get.8.en.html).

### 2.3. Chữ ký của kho bảo đảm điều gì?

**Hash/checksum (giá trị kiểm tra nội dung)** là giá trị tính từ dữ liệu để phát hiện nội dung khác với dữ liệu đã được tham chiếu. **Chữ ký số** cho phép kiểm tra dữ liệu có được ký bằng khóa tương ứng với khóa tin cậy hay không. **Khóa công khai** dùng để kiểm tra chữ ký; bên giữ khóa bí mật mới tạo chữ ký tương ứng.

APT thông thường kiểm tra chữ ký metadata cấp kho, rồi kiểm tra các hash liên kết từ metadata tới chỉ mục và file gói. Mô hình đơn giản:

```text
Khóa kho được tin cậy
        |
        v
Metadata kho có chữ ký -> hash chỉ mục -> hash file gói tải về
```

Mũi tên là chuỗi kiểm chứng nội dung và nguồn tin cậy, không phải bằng chứng chất lượng mã. APT không mặc định thực hiện việc kiểm tra chữ ký riêng của từng `.deb` theo cùng mô hình RPM. Chữ ký hợp lệ không chứng minh phần mềm không có lỗi, không có mã độc hoặc nguồn đó phù hợp release của bạn; nguồn ký hay khóa ký cũng có thể bị xâm phạm. Xem [apt-secure(8)](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html).

Khi thêm nguồn bên ngoài, phải biết bên giữ khóa, cách xác minh khóa, release/kiến trúc được hỗ trợ và quy trình cập nhật/gỡ. Cấu hình hiện đại có thể dùng `Signed-By` để giới hạn khóa được chấp nhận cho nguồn cụ thể, thay vì mở rộng tin cậy chung. Lab chỉ dùng nguồn đã cấu hình, không thêm kho hoặc tắt kiểm tra chữ ký.

### 2.4. Nguồn, candidate và pinning liên quan thế nào?

**Installed version** là phiên bản cơ sở dữ liệu ghi đã cài. **Candidate version** là phiên bản APT dự kiến chọn theo dữ liệu kho và chính sách hiện tại. Hai giá trị có thể khác; candidate không phải chương trình đang chạy.

```bash
apt-cache policy python3
```

Đọc `Installed`, `Candidate`, rồi bảng phiên bản và dòng nguồn/độ ưu tiên. **Minh họa về hình dạng**, các chữ thay thế không phải phiên bản để copy vào lệnh:

```text
python3:
  Installed: phiên-bản-đang-cài
  Candidate: phiên-bản-dự-kiến
  Version table:
     phiên-bản-dự-kiến 500
        500 địa-chỉ-kho release/component kiến-trúc Packages
 *** phiên-bản-đang-cài 100
        100 /var/lib/dpkg/status
```

`***` đánh dấu phiên bản cài; các giá trị ưu tiên ảnh hưởng lựa chọn, nhưng đừng coi mọi máy đều có 500/100 hay candidate luôn khác installed. **Pinning** là chính sách đặt ưu tiên cho các phiên bản/nguồn để ảnh hưởng việc chọn gói. Nó không tạo sự tương thích còn thiếu và không biến việc trộn release thành an toàn.

Một gói từ release khác có thể đòi thư viện nền mới, kéo theo nhiều thay đổi. Khi candidate bất ngờ, kiểm tra nguồn và chính sách trước khi ép cài hoặc downgrade. Xem [apt-cache(8)](https://manpages.debian.org/trixie/apt/apt-cache.8.en.html) và [apt_preferences(5)](https://manpages.debian.org/trixie/apt/apt_preferences.5.en.html).

File nguồn có thể nằm ở `/etc/apt/sources.list`, các file `.list` hoặc `.sources` trong `/etc/apt/sources.list.d/`; `.sources` là định dạng nhiều trường deb822. Không có `sources.list` đơn lẻ không chứng minh máy không cấu hình kho. Có thể xem trong trình soạn thảo hoặc liệt kê thư mục; khi chia sẻ kết quả, tránh đưa thông tin xác thực hoặc địa chỉ kho nội bộ vào nơi công khai. Xem [sources.list(5)](https://manpages.debian.org/trixie/apt/sources.list.5.en.html).

## 3. Từ tên lệnh đến file và package sở hữu

### 3.1. PATH tìm chương trình, không tra kho gói

**Shell** là bộ diễn giải lệnh như Bash. **PATH** là biến môi trường liệt kê thư mục tìm executable theo thứ tự, thường phân cách bằng `:`. **Biến môi trường** là giá trị cấu hình được truyền cho chương trình con. Khi gõ `python3`, shell còn có thể gặp **alias** (tên thay thế) hoặc **function** (hàm được định nghĩa trong shell) trước executable bên ngoài.

```bash
command -v python3
type -a python3
printf '%s\n' "$PATH"
```

`command -v` xem cách shell phân giải một tên lệnh; `type -a` của Bash liệt kê các định nghĩa/đường dẫn có thể dùng. Có `/usr/local/bin/python3` trước `/usr/bin/python3` thì bạn có thể chạy bản cài thủ công thay cho bản distro. Khi gọi `/usr/bin/python3` trực tiếp, bạn chọn đường dẫn đó mà không tìm bằng PATH.

Một lệnh được tìm thấy chưa chứng minh chạy được: có thể thiếu quyền, sai định dạng, sai kiến trúc hoặc thiếu loader/thư viện. Và PATH chỉ tìm executable theo tên; nó không phải danh sách tìm thư viện `.so` của dynamic linker.

### 3.2. Link và file đích có thể thuộc các gói khác nhau

**Symbolic link (liên kết tượng trưng)** là file chứa đường dẫn dẫn tới một tên khác. `/usr/bin/python3` có thể là link tới executable phiên bản cụ thể. Kiểm tra cả hai:

```bash
ls -l /usr/bin/python3
readlink -f /usr/bin/python3
dpkg-query -S /usr/bin/python3
python_target=$(readlink -f /usr/bin/python3)
dpkg-query -S "$python_target"
```

`readlink -f` giải các thành phần liên kết và trả đường dẫn chuẩn hóa. **Minh họa:** link thuộc `python3-minimal`, đích thuộc một gói phiên bản Python cụ thể; không mặc định thuộc gói tên `python3`. `dpkg-query -S` hỏi cơ sở dữ liệu gói nào ghi nhận đường dẫn, không tự phân tích nội dung file để đoán nguồn.

Không tìm ra chủ gói có thể do file cài thủ công, do script tạo, đường dẫn alias từ việc hợp nhất `/usr`, hoặc không có cơ sở dữ liệu phù hợp. Một đường dẫn được ghi nhận cũng chưa chứng minh file chưa bị sửa hoặc ghi đè sau cài. Công cụ này không phải chứng nhận toàn vẹn hay bản ghi lịch sử chắc chắn về lần tải gói.

### 3.3. Trạng thái package và phiên bản ứng dụng là hai phép đo

```bash
dpkg-query -W -f='${binary:Package}\t${Version}\t${db:Status-Abbrev}\n' python3
/usr/bin/python3 --version
```

`-W` truy vấn gói; `-f` chọn trường xuất. Dấu nháy đơn giữ `${...}` cho `dpkg-query`, không cho Bash thay biến. `\t` tạo tab, `\n` xuống dòng. Trạng thái thường `ii ` với gói được yêu cầu cài và đang installed; trạng thái khác cần đọc kỹ, vì có mục trong cơ sở dữ liệu không đồng nghĩa đang cài đầy đủ. Có thể dùng `dpkg-query -W -f='${Status}\n' tên-gói` để xem trạng thái bằng chữ.

Phiên bản gói có thể gồm phần phiên bản gốc và phần sửa đổi của distro, trong khi `python3 --version` báo phiên bản trình thông dịch. **Backport** là đưa bản sửa từ phiên bản mới về nhánh đang duy trì; distro có thể sửa lỗi mà không đổi số phiên bản gốc theo cách bạn mong đợi. Không kết luận đã vá/ chưa vá chỉ từ phiên bản upstream của ứng dụng.

`python3 --version` chạy một tiến trình mới theo file hiện tại, không hỏi phiên bản của mọi dịch vụ Python đang chạy lâu dài. Xem [dpkg-query(1)](https://manpages.debian.org/trixie/dpkg/dpkg-query.1.en.html).

## 4. File có trên máy rồi, vì sao còn cần thư viện?

### 4.1. Từ source code đến executable

**Source code (mã nguồn)** là văn bản mô tả chương trình, ví dụ C. **Compiler (trình biên dịch)** chuyển mã nguồn thành mã dùng cho nền tảng đích. **Linker (bộ liên kết lúc xây dựng)** nối các phần mã và thông tin thư viện để tạo sản phẩm executable hoặc thư viện. Lệnh `cc` là tên giao diện trình biên dịch C trên nhiều máy, không phải tên một package cố định.

**ELF (Executable and Linkable Format)** là định dạng file phổ biến trên Linux, chứa thông tin để công cụ và hệ điều hành hiểu mã/dữ liệu, kiến trúc, cách nạp. ELF có thể là executable, file đối tượng hoặc shared library; thấy ELF chưa có nghĩa file tự chạy được.

**Shared library (thư viện dùng chung)** là mã có thể được nạp vào nhiều chương trình, thường có tên chứa `.so`. **Dynamic linking (liên kết động)** để một phần mã thư viện được tìm/nạp khi chạy. **Static linking (liên kết tĩnh)** đưa các phần mã thư viện cần thiết vào executable lúc xây dựng.

| Cách liên kết | Lợi ích | Giới hạn |
|---|---|---|
| Động | Nhiều ứng dụng dùng thư viện được cài riêng; cập nhật thư viện có thể phục vụ nhiều chương trình | Phụ thuộc thư viện tương thích và đường tìm phù hợp |
| Tĩnh | Giảm phụ thuộc shared library cho phần đã liên kết tĩnh | Phải xây/phát hành lại để nhận bản vá mã đã nhúng; vẫn phụ thuộc kernel, kiến trúc, dữ liệu và có thể có thành phần tải thêm |

Không coi static binary là “chạy mọi Linux”. Cũng không phải mã dùng chung nghĩa mọi tiến trình chia sẻ toàn bộ dữ liệu đang sửa: mỗi tiến trình có trạng thái riêng, dù các trang mã chỉ đọc có thể được dùng chung ở tầng bộ nhớ. Xem [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html).

### 4.2. Kernel và dynamic linker làm việc theo chuỗi nào?

**Kernel** là nhân hệ điều hành thực hiện yêu cầu khởi chạy và quản lý bộ nhớ. **Dynamic linker/loader (bộ liên kết/nạp động)** là chương trình được chọn để nạp shared library và nối các tham chiếu mã khi chạy. Nó khác linker lúc xây dựng.

```text
Shell chọn đường dẫn chương trình
             |
             | yêu cầu thực thi
             v
Kernel đọc định dạng ELF và thông tin nạp
             |
             | nếu có PT_INTERP: nạp trình thông dịch ELF đó
             v
Dynamic linker đọc các dependency và tìm thư viện
             |
             | ánh xạ mã/dữ liệu, giải các tham chiếu cần thiết
             v
Khởi tạo thư viện/chương trình -> mã ứng dụng bắt đầu chạy
```

**`PT_INTERP`** là loại mục trong ELF ghi đường dẫn trình thông dịch cho executable động; từ “interpreter” ở đây chỉ loader ELF, không phải Bash hay trình thông dịch Python. **Mapping (ánh xạ bộ nhớ)** đưa vùng mã/dữ liệu vào không gian địa chỉ tiến trình để nó truy cập. **Không gian địa chỉ** là tập các địa chỉ bộ nhớ mà tiến trình sử dụng; cùng một thư viện có thể được nạp tại địa chỉ khác nhau ở các lần chạy.

Trong glibc điển hình, loader có đường dẫn như `/lib64/ld-linux-x86-64.so.2` trên x86-64, nhưng ARM64 hoặc hệ dùng musl có tên/đường dẫn khác. **glibc** và **musl** là hai triển khai thư viện C và môi trường chạy liên quan; cùng file cho “Linux” chưa chứng minh tương thích cả hai. Không chép đường dẫn loader từ ví dụ sang máy khác. Cách kernel dùng PT_INTERP được mô tả trong [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html).

**Symbol (ký hiệu)** là tên một hàm/đối tượng mà các phần mã liên kết với nhau, ví dụ `puts` để in chuỗi C. Loader giải các symbol cần thiết; tùy cấu hình, một số việc tìm hàm có thể trì hoãn tới lần gọi đầu, và ứng dụng có thể tải thư viện bổ sung về sau. Vì vậy không giả định mọi thư viện dùng suốt đời chương trình đều có mặt trong danh sách ban đầu.

### 4.3. ABI: tìm được tên thư viện chưa chắc dùng đúng

**API (Application Programming Interface)** là giao diện ở mức mã nguồn, ví dụ tên hàm và cách gọi được tài liệu mô tả. **ABI (Application Binary Interface)** là giao ước ở mức mã máy: cách truyền tham số, bố trí dữ liệu, tên/phiên bản symbol và quy tắc nền tảng. Chương trình đã biên dịch cần ABI phù hợp để gọi thư viện đúng.

Ví dụ mã nguồn gọi một hàm có thể vẫn biên dịch được sau sửa nhẹ, nhưng executable cũ không gọi đúng một thư viện mới đã đổi bố trí cấu trúc. Đây là nguyên nhân có lỗi `undefined symbol`, `version ... not found`, hoặc lỗi khi chạy dù tên file `.so` đã tìm thấy.

**Plugin** là thành phần mở rộng mà chương trình có thể tải thêm khi cần tính năng. **SONAME** là tên nhận diện thư viện được ghi trong metadata ELF, thường mang số đời ABI như `libdemo.so.1`; ví dụ này là tên giả định. **`DT_NEEDED`** là các mục ghi tên đối tượng phụ thuộc trực tiếp trong phần thông tin liên kết động của ELF. Số đời SONAME không đồng nghĩa phiên bản package và không là chứng minh tuyệt đối thư viện thực tế tương thích.

```bash
readelf -d ./hello
```

`readelf` đọc cấu trúc ELF; `-d` xem phần dynamic, chú ý `NEEDED`, `SONAME` nếu đối tượng có, `RPATH`/`RUNPATH` nếu được ghi. Với executable C nhỏ trong lab, thường có `NEEDED` cho `libc.so.6`, thư viện C chuẩn ở hệ glibc. Đó là dependency trực tiếp được khai báo, không phải danh sách tất cả module tải muộn, plugin hay file dữ liệu.

### 4.4. Loader tìm thư viện ở đâu, có dùng PATH không?

PATH tìm **chương trình**. Với ELF động dùng loader glibc và tên dependency không chứa `/`, thứ tự tìm được tóm tắt theo các bước chính:

1. `DT_RPATH` nếu đối tượng có nó và không có `DT_RUNPATH` tương ứng.
2. `LD_LIBRARY_PATH` trong môi trường, trừ các trường hợp chạy bảo mật không sử dụng nó.
3. `DT_RUNPATH` cho dependency trực tiếp thích hợp của đối tượng; không mặc định áp cho mọi dependency con.
4. Cache `/etc/ld.so.cache` của loader.
5. Các thư mục mặc định phù hợp hệ/kiến trúc, chẳng hạn `/lib`, `/usr/lib` hoặc biến thể tương ứng.

**RPATH/RUNPATH** là thông tin đường tìm thư viện nhúng trong ELF. **Cache** là dữ liệu tra cứu được tạo trước để tìm nhanh; công cụ `ldconfig` trên hệ glibc quản lý cache và các liên kết thư viện liên quan. **Secure-execution mode (chế độ thực thi bảo mật)** là chế độ loader áp dụng trong một số tình huống có đặc quyền/danh tính khác, nơi biến môi trường có thể bị bỏ qua hoặc loại bỏ.

Bảng thứ tự trên có phạm vi: tên có `/` được xử lý như đường dẫn; cờ xây dựng, các thư mục tối ưu phần cứng và loader khác như musl có quy tắc khác. RPATH và RUNPATH không hoàn toàn thay thế nhau, đặc biệt về dependency con. Đọc [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html) trước khi sửa một ứng dụng thật.

`LD_LIBRARY_PATH=/đường/dẫn ./app` chỉ thay môi trường của lần chạy ấy. Nó có thể giúp thử bản thư viện riêng, nhưng cũng khiến chương trình nạp nhầm thư viện hoặc mã không tin cậy nếu thư mục không được kiểm soát. Không đưa nó vào cấu hình toàn hệ thống để chữa một ứng dụng chưa rõ nguyên nhân. Không biến tìm thư viện thành bài thử với thư mục do người khác ghi được.

### 4.5. `readelf` và `ldd` cho biết điều gì, khác nhau ra sao?

```bash
readelf -l ./hello
readelf -d ./hello
ldd ./hello
```

`-l` xem **program headers**, thông tin các vùng và cách nạp; tìm `INTERP` cùng dòng yêu cầu trình thông dịch. `-d` đọc khai báo liên kết động. Hai thao tác đọc file, không khởi chạy ứng dụng theo mục đích thông thường của công cụ.

`ldd` thường dùng cơ chế loader để liệt kê thư viện và đường dẫn tìm được trong môi trường kiểm tra. **Minh họa:** `libc.so.6 => /lib/.../libc.so.6 (0x...)`. Phần `=>` cho thấy nơi tìm được; địa chỉ trong ngoặc không phải phiên bản. `not found` là dependency không được giải quyết theo môi trường đó. Dòng loader và `linux-vdso` có thể xuất hiện; **vDSO** là vùng hỗ trợ do kernel cung cấp cho tiến trình, không phải lúc nào cũng là một file `.so` để truy tìm package.

**Không dùng `ldd` với executable không tin cậy.** Tùy bản/cách xử lý, việc kiểm tra có thể dẫn tới thực thi mã; man page cảnh báo rõ trường hợp này. Hãy đọc metadata bằng `readelf` trước, trong môi trường thích hợp; mọi công cụ phân tích file cũng có giới hạn, nên không coi phân tích tĩnh là chứng minh file an toàn.

`readelf` không chứng minh thư viện sẽ được tìm thấy lúc chạy; `ldd` không chứng minh đường đi của mọi lần chạy, mọi plugin hoặc mọi chế độ đặc quyền. Lab chỉ dùng `ldd` với file vừa tự biên dịch từ mã ngắn đã đọc. Xem [ldd(1)](https://man7.org/linux/man-pages/man1/ldd.1.html) và [GNU Binutils: readelf](https://sourceware.org/binutils/docs/binutils/readelf.html).

## 5. Lab Debian/Ubuntu: kiểm kê, chuẩn bị công cụ và truy dấu executable

### 5.1. Xác định môi trường và tạo chỗ ghi kết quả

```bash
cat /etc/os-release
uname -m
dpkg --print-architecture
command -v apt apt-cache apt-get dpkg-query
mkdir -p "$HOME/linux-lab/packages"
package_lab=$(mktemp -d "$HOME/linux-lab/packages/run.XXXXXX")
cd "$package_lab"
pwd
```

`/etc/os-release` mô tả distro user space; `uname -m` xem tên kiến trúc máy do kernel báo, như `x86_64`. Tên kiến trúc gói có thể là `amd64`, không dùng hai chuỗi khác cách đặt tên để kết luận máy không tương thích. `command -v` tìm công cụ, không chứng minh máy thuộc Debian chỉ vì ai đó đã cài một lệnh tên `apt`.

`mktemp -d` tạo thư mục riêng, `package_lab` lưu đường dẫn; chỉ tiếp tục khi tạo và `cd` thành công. File báo cáo và mã mẫu nằm tại đây. Hãy chọn nhánh phù hợp distro; container có thể thiếu quyền cài dù bên trong hiện Debian/Ubuntu.

### 5.2. Ghi trạng thái trước khi cài

```bash
apt-cache policy python3 > python-policy-before.txt
cat python-policy-before.txt
dpkg-query -W -f='${binary:Package}\t${Version}\t${db:Status-Abbrev}\n' \
    python3 curl strace build-essential binutils > packages-before.txt 2> query-before-errors.txt
query_status=$?
printf 'query_status=%s\n' "$query_status"
cat packages-before.txt
cat query-before-errors.txt
command -v python3
```

Đọc installed/candidate và nguồn ở báo cáo policy. `dpkg-query` có thể trả khác 0 nếu một gói chưa có trong cơ sở dữ liệu; ghi riêng lỗi để không coi bảng một phần là danh sách đầy đủ. Dòng có tên/phiên bản vẫn cần đọc trạng thái, không mặc định mọi mục đều installed. Nếu APT chưa có chỉ mục, policy có thể thiếu candidate; bước update sẽ giúp kiểm tra lại.

Nếu Python đã có ở `/usr/bin` thì kiểm tra link và đích bằng mục 3.2 ngay; nếu chưa có, làm sau bước cài. Nếu `command -v python3` ra `/usr/local` hoặc môi trường ảo, ghi cả đường đó lẫn `/usr/bin/python3`: đây là hai câu hỏi nguồn gốc khác nhau.

### 5.3. Cập nhật metadata, xem mô phỏng rồi cài

Những lệnh sudo sau thay đổi hệ thống VM: update thay chỉ mục kho; install có thể cài/nâng gói và chạy script. Không cần nâng toàn bộ distro để hoàn thành lab.

```bash
sudo apt update
update_status=$?
printf 'update_status=%s\n' "$update_status"
sudo apt-get -s install python3 curl strace build-essential binutils
```

`-s` là **simulation (mô phỏng)**: tính kế hoạch cài, không thực hiện cài/gỡ gói. Dùng sudo để giảm sai lệch do người dùng thường không đọc đủ cấu hình; mô phỏng vẫn không khóa trạng thái như một lần thay đổi thật. Nếu nguồn hay trạng thái thay đổi sau đó, kế hoạch có thể đổi.

Đọc danh sách gói thêm/nâng/gỡ, dung lượng tải và dung lượng đĩa. Trong mô phỏng có thể thấy `Inst`, `Conf`, `Remv`, tương ứng kế hoạch cài/nâng, cấu hình, gỡ. Nếu định cài vài công cụ mà kế hoạch đòi gỡ nhiều thành phần nền, dừng để kiểm tra nguồn, candidate và phụ thuộc. Cảnh báo update, lỗi chữ ký hoặc nguồn không tải được cần xử lý trước khi tin kế hoạch.

Khi kế hoạch phù hợp, chạy:

```bash
sudo apt install python3 curl strace build-essential binutils
install_status=$?
printf 'install_status=%s\n' "$install_status"
```

APT có thể hỏi xác nhận; đọc kế hoạch ngay tại lần cài vì nó có thể khác mô phỏng. Không tự thêm `-y` để bỏ qua việc đọc. Nếu chỉ thiếu một vài gói, có thể cài chúng; yêu cầu gói đã cài cũng có thể nâng nó lên candidate hoặc đánh dấu cài thủ công, nên không gọi đây là thao tác chắc chắn không đổi gì.

`curl` chuyển dữ liệu theo các giao thức mạng, chưa cần tải nguồn ngoài trong bài. `strace` theo dõi **system call (lời gọi hệ thống)**, các yêu cầu chương trình gửi kernel; sẽ dùng ở bài sau. `build-essential` cung cấp công cụ xây dựng cơ bản; `binutils` có các công cụ xem/xử lý file mã máy như `readelf`.

### 5.4. Kiểm tra sau cài, không chỉ thấy status 0

```bash
dpkg-query -W -f='${binary:Package}\t${Version}\t${db:Status-Abbrev}\n' \
    python3 curl strace build-essential binutils > packages-after.txt
cat packages-after.txt
command -v python3 curl strace cc make readelf
/usr/bin/python3 --version
curl --version
strace --version
cc --version
readelf --version
apt-cache policy python3 > python-policy-after.txt
```

Các gói yêu cầu dự kiến ở trạng thái `ii `; công cụ cần tìm thấy và chạy lệnh xem phiên bản được. `make` là công cụ thực hiện quy tắc xây dựng từ file mô tả, không phải trình biên dịch. `cc`/`make` được kéo qua quan hệ gói, nên tên executable không nhất thiết là tên gói bạn đã nhập.

Giới hạn: `--version` xác nhận một lần chạy mới, không kiểm tra mọi chức năng hay dịch vụ liên quan. So sánh hai bảng before/after để biết chính xác gói nào khác, giữ thông tin nguồn/candidate làm bối cảnh. Không sao chép số phiên bản của người khác làm tiêu chí đạt.

### 5.5. Tìm gói của Python và đọc ELF đúng file đích

```bash
ls -l /usr/bin/python3
python_target=$(readlink -f /usr/bin/python3)
printf 'target=%s\n' "$python_target"
dpkg-query -S /usr/bin/python3
dpkg-query -S "$python_target"
readelf -h "$python_target" > python-elf-header.txt
readelf -l "$python_target" > python-program-headers.txt
readelf -d "$python_target" > python-dynamic.txt
cat python-elf-header.txt
grep -A 1 'INTERP' python-program-headers.txt
grep -E 'NEEDED|RPATH|RUNPATH' python-dynamic.txt
```

`readelf -h` xem **ELF header**, phần đầu mô tả loại, kích thước kiểu ELF và nền tảng. Đọc `Class`, `Machine`, `Type`; `ELF64` không tự nói CPU nào, còn `Machine` cho kiến trúc. `Type: DYN` không mặc định là shared library vì executable **PIE (position-independent executable)** cũng có thể dùng loại ELF này; PIE là chương trình được xây để nạp ở địa chỉ khác nhau.

Dùng toàn bộ file program headers để tránh bỏ mất `INTERP` nếu chỉ `head -n 30`. `grep -A 1` in dòng khớp và một dòng sau; `grep -E` chọn các mục dynamic cần xem. Nếu grep trả 1, có thể không có mục ấy, không đồng nghĩa readelf trước đó đã thành công: kiểm tra chẩn đoán và loại file.

Ghi lại đường loader thật và các tên NEEDED; không sửa hoặc tạo symlink thư viện ở bước này. Cùng package Python nhưng binary của distro khác có thể có danh sách NEEDED khác; dùng dữ liệu máy mình.

### 5.6. Tự xây một executable tin cậy để đối chiếu liên kết động

```bash
cat > hello.c <<'C'
#include <stdio.h>

int main(void)
{
    puts("hello from C");
    return 0;
}
C
cc -Wall -Wextra -o hello hello.c
compile_status=$?
printf 'compile_status=%s\n' "$compile_status"
./hello
readelf -l ./hello > hello-program-headers.txt
readelf -d ./hello > hello-dynamic.txt
ldd ./hello > hello-libraries.txt
cat hello-libraries.txt
```

`#include <stdio.h>` khai báo giao diện nhập/xuất C, gồm `puts` để in chuỗi và xuống dòng. `main` là hàm vào của mã C trong chương trình này, `return 0` báo kết thúc thành công. `-Wall -Wextra` bật các nhóm cảnh báo phổ biến, không phải mọi kiểm tra đúng đắn; `-o hello` đặt tên đầu ra. Chỉ chạy khi compile_status là 0 và không có lỗi cần giải quyết.

`./hello` chọn file `hello` trong thư mục hiện tại (`.`), không nhờ PATH tìm. **Minh họa:** in `hello from C`; trên hệ glibc động thường có `libc.so.6` trong metadata/thư viện. Đây là file tự biên dịch từ nguồn đã đọc, nên phù hợp phép thử `ldd` trong phạm vi lab.

Tự đối chiếu:

1. Tìm dòng INTERP trong `hello-program-headers.txt` để biết loader.
2. Tìm NEEDED trong `hello-dynamic.txt` để biết phụ thuộc trực tiếp.
3. Đọc đường `libc.so.6` trong `hello-libraries.txt` để biết lần kiểm tra giải tên tới đâu.
4. Dùng `readlink -f đường-thư-viện` và `dpkg-query -S đường-thư-viện` với **đường dẫn thật quan sát được** để tìm gói cung cấp, lưu ý khác biệt `/lib`–`/usr/lib`.

Nếu `readelf` nói file không có dynamic section hoặc `ldd` báo không phải executable động, kiểm tra cách compiler/linker của môi trường được cấu hình, không cố tạo dependency cho giống ví dụ. Bài không yêu cầu liên kết tĩnh; thử `-static` có thể cần thêm thư viện phát triển tĩnh và vẫn không chứng minh chương trình portable mọi máy.

## 6. Nếu dùng họ RPM thì đối chiếu thế nào?

**RPM** là định dạng/công cụ và cơ sở dữ liệu quản lý gói của nhiều distro. **DNF** là lớp quản lý nguồn, lựa chọn và phụ thuộc trên một số distro RPM. Một số release dùng DNF5, một số dùng DNF phiên bản khác; cùng tên `dnf` chưa chứng minh mọi tùy chọn giống nhau.

Chọn nhánh này **thay cho** lab APT khi máy đúng distro:

```bash
cat /etc/os-release
command -v dnf rpm
dnf info python3
rpm -q python3
rpm -qf /usr/bin/python3
readlink -f /usr/bin/python3
```

`dnf info` xem thông tin gói và nguồn theo dữ liệu/cấu hình DNF; có thể làm mới metadata, không chỉ đọc file dpkg. `rpm -q` hỏi gói cài, `rpm -qf` hỏi gói sở hữu file. File link và đích vẫn có thể thuộc gói khác nhau, nên truy vấn cả hai nếu cần.

Tên gói compiler, thư viện phát triển và tên nhóm công cụ khác theo distro/release. Không thay máy móc `build-essential` vào lệnh DNF. Hãy xem tài liệu distro và kế hoạch cài trước; việc có RPM database cũng không tự chứng minh distro dùng DNF làm giao diện chính. Cơ chế chữ ký gói RPM khác chuỗi metadata APT; không áp mô tả apt-secure nguyên xi.

Xem [RPM manual](https://rpm.org/docs/6.0.x/man/rpm.8) và [DNF5: info](https://dnf5.readthedocs.io/en/latest/commands/info.8.html); dùng `dnf --version`, `rpm --version` và man page đúng máy để đối chiếu. Phần ELF/shared library vẫn áp dụng khi môi trường đáp ứng điều kiện loader, không phụ thuộc chỉ vào đuôi `.deb` hay `.rpm`.

## 7. Dependency của dự án khác dependency do distro quản lý

### 7.1. Python venv giữ thư viện dự án ở phạm vi riêng

**Interpreter (trình thông dịch)** là chương trình thực thi mã ngôn ngữ như Python. **Python package** là gói trong hệ sinh thái Python; nó không đồng nghĩa gói distro `.deb` có tên liên quan. **pip** là công cụ cài các gói Python. Một gói Python cũng có thể chứa phần mã native, tức mã máy phải phù hợp kiến trúc và môi trường.

**Virtual environment (venv, môi trường ảo Python)** là thư mục chứa môi trường interpreter và thư viện riêng cho dự án, mặc định tách khỏi các package Python toàn hệ thống. Nó không phải VM hoặc sandbox bảo mật; mã bên trong vẫn chạy bằng quyền user và thường dùng interpreter/thư viện nền của máy.

Nếu bước tạo báo thiếu hỗ trợ venv trên Debian/Ubuntu, xem `apt-cache policy python3-venv`, mô phỏng cài rồi cài gói phù hợp với **Python distro** đang dùng. Không mặc định gói này sửa được một Python cài thủ công khác phiên bản.

```bash
/usr/bin/python3 -m venv .venv
.venv/bin/python -c 'import sys; print(sys.executable); print(sys.prefix); print(sys.base_prefix)'
.venv/bin/python -m pip --version
.venv/bin/python -m pip freeze > python-project-packages.txt
```

`-m venv` chạy module tạo môi trường. `sys.executable` là đường interpreter; `sys.prefix` là gốc môi trường hiện tại, `sys.base_prefix` là gốc Python nền. **Minh họa:** hai prefix khác nhau xác nhận đang dùng venv. `python -m pip` gắn pip với đúng interpreter thay vì đoán lệnh `pip` trong PATH. Không cần activation để gọi đường dẫn `.venv/bin/python` trực tiếp.

`pip freeze` ghi các phiên bản theo phạm vi nó báo, nhưng không là bản mô tả đầy đủ distro, thư viện hệ thống, nguồn tải và mọi điều kiện tái tạo. Danh sách có thể rỗng trong môi trường mới; các gói nền mặc định và việc có pip/setuptools thay đổi theo bản Python. Lab không cần tải package ngoài để chứng minh cách tách môi trường.

Nếu Python distro báo `externally-managed-environment`, đó là dấu hiệu môi trường nền được quản lý bên ngoài pip. Chọn venv cho dependency dự án thay vì `sudo pip install` hoặc bỏ chặn để ghi đè gói distro. Xem [Python: venv](https://docs.python.org/3/library/venv.html) và [Externally Managed Environments](https://packaging.python.org/en/latest/specifications/externally-managed-environments/).

### 7.2. Binary cài thủ công cần địa chỉ và trách nhiệm rõ

**Prefix cài đặt** là gốc cây thư mục mà phần mềm đặt file, ví dụ `/usr/local` hoặc một cây riêng dưới `/opt`. Distro thường quản lý nhiều file dưới `/usr`; chép đè executable/thư viện vào đó có thể khiến package database và file thật không còn khớp.

Nếu phải cài thủ công, ghi rõ nguồn, phiên bản, kiến trúc, prefix, cách cập nhật và cách gỡ; ưu tiên cách đóng gói hoặc phương án của nhà cung cấp phù hợp môi trường. Không đưa `/usr/local` lên PATH rồi quên rằng nó có thể che bản distro. Không chạy một chuỗi tải script rồi đưa thẳng vào shell có quyền quản trị chỉ để tiết kiệm bước đọc nguồn.

`dpkg-query` không quản lý toàn bộ những gì installer khác tạo, còn pip trong venv không quản lý gói hệ thống. Phải hỏi đúng cơ sở dữ liệu. Gỡ một môi trường dự án không có nghĩa gỡ interpreter distro, và gỡ interpreter có thể làm hỏng môi trường ảo dựa vào nó.

## 8. Nâng cấp, restart và rollback: file trên đĩa khác chương trình đang chạy

### 8.1. Cài phiên bản mới không tự thay toàn bộ mã của tiến trình cũ

Khi nâng package, file trên đĩa có thể được thay, nhưng tiến trình đã chạy còn tham chiếu mã/thư viện cũ được ánh xạ trong bộ nhớ. Chạy `app --version` sau nâng chỉ tạo một tiến trình mới, không đủ để kết luận mọi dịch vụ dài hạn đã dùng bản mới.

**Service (dịch vụ)** là chương trình được quản lý để phục vụ công việc nền, ví dụ web server. **Restart** là dừng và khởi chạy lại; **reload** thường yêu cầu đọc lại một phần cấu hình theo khả năng ứng dụng, không mặc định nạp lại mọi mã thư viện. Script gói có thể tự restart/reload hoặc công cụ của distro có thể đề xuất, nhưng phải xác nhận hành vi thật.

**CVE** là mã nhận diện một lỗ hổng bảo mật đã được công bố. Khi một thư viện được vá cho CVE, tiến trình còn dùng mã cũ có thể chưa nhận bản vá. Cần đối chiếu thông báo bảo mật của distro, phiên bản gói đã vá, tiến trình/dịch vụ dùng nó và yêu cầu restart; cập nhật kernel thường còn cần khởi động lại máy để chạy kernel mới.

Không chạy restart một dịch vụ chưa xác định chỉ vì vừa `apt install` công cụ. Với hệ systemd, `systemctl` là công cụ quản lý dịch vụ nhưng sự hiện diện của nó không chứng minh systemd đang quản lý môi trường; hãy kiểm tra đúng hệ khởi tạo và dịch vụ như các bài sau.

### 8.2. Vì sao downgrade không luôn là rollback?

**Upgrade** là chuyển sang phiên bản mới hơn; **downgrade** là cài phiên bản thấp hơn. **Rollback** là đưa hệ về trạng thái hoạt động trước thay đổi, gồm cả mã, cấu hình và dữ liệu liên quan. **Migration dữ liệu** là chuyển cấu trúc hoặc nội dung lưu trữ để phù hợp phiên bản mới, chẳng hạn đổi cấu trúc cơ sở dữ liệu.

Ví dụ chương trình mới đổi định dạng dữ liệu; cài lại executable cũ có thể không đọc được dữ liệu mới. Gói cũ cũng có thể không còn trong kho hoặc cần tập phụ thuộc cũ. Vì vậy không coi `apt install package=old-version` là lệnh hoàn tác tổng quát.

**Snapshot** là mốc chụp trạng thái lưu trữ/VM để phục hồi; **clone** là bản sao môi trường dùng thử. Chụp snapshot máy chạy chưa bảo đảm mọi dữ liệu ứng dụng nhất quán, dữ liệu trên volume ngoài được chụp cùng hoặc yêu cầu đã phục vụ được hoàn tác. Cần hiểu phạm vi và có backup/kiểm thử phục hồi phù hợp.

Quy trình thực tế nên gồm:

1. Ghi distro, nguồn, phiên bản gói, cấu hình và dịch vụ liên quan trước thay đổi.
2. Đọc release notes, tức ghi chú phiên bản, và yêu cầu migration/restart.
3. Thử trên clone hoặc bản sao với dữ liệu phù hợp; dự kiến downtime (thời gian gián đoạn) nếu có.
4. Có phương án phục hồi dữ liệu/cấu hình cùng phiên bản tương thích, không chỉ danh sách gói.
5. Sau thay đổi, kiểm tra trạng thái gói, dịch vụ và chức năng cần dùng.

Lab này chỉ cài công cụ trong VM, nhưng thói quen ghi before/after dùng lại khi làm hệ thật. Giữ file báo cáo để giải thích trạng thái đã đổi; không tự chạy nâng toàn hệ thống hoặc downgrade thư viện nền để tạo một bài thử lỗi.

### 8.3. Xóa executable khác gỡ package

`rm /usr/bin/tool` chỉ gỡ một tên file. Cơ sở dữ liệu vẫn có thể ghi gói đã cài, các file khác và cấu hình còn đó, dependency không được cập nhật; tiến trình đã mở đối tượng cũ cũng có thể tiếp tục chạy.

Dùng cơ chế gỡ của đúng trình quản lý, đọc kế hoạch và phạm vi. `remove`/`purge` không đồng nghĩa xóa mọi dữ liệu dịch vụ hay thư mục cá nhân. `autoremove` là suy luận từ trạng thái “cài tự động”, không phải phép đo xem bạn còn cần một công cụ hay không. Luôn đọc danh sách, đặc biệt nếu một dependency cũ nay được bạn dùng trực tiếp.

Trong lab có thể giữ công cụ cho các bài tiếp theo. Khi dọn mã/báo cáo, chỉ thao tác thư mục `package_lab` của mình; không gỡ cả `build-essential` hoặc chạy autoremove chỉ vì đã làm xong một bài.

## 9. Lỗi thường gặp: hỏi đúng tầng trước khi sửa

### 9.1. `command not found`

Kiểm tra `type -a tên-lệnh`, PATH và trạng thái gói. Có thể chương trình chưa cài, executable có tên khác package, hoặc thư mục không nằm trong PATH. Cài xong chưa chắc shell đã dùng đúng đường dẫn; Bash có thể nhớ đường cũ, `hash -r` xóa cache tra lệnh của Bash nếu cần rồi kiểm tra lại.

Không thêm `.` vào PATH toàn phiên chỉ để chạy file lab; dùng `./hello` nêu rõ file muốn chạy.

### 9.2. File tồn tại nhưng báo `No such file or directory` khi chạy

Có thể đường loader trong PT_INTERP không tồn tại. Với script, dòng **shebang**, tức dòng đầu như `#!/bin/bash` chỉ bộ diễn giải, có thể trỏ tới chương trình thiếu hoặc bị ký tự CRLF làm sai tên. Không vội tạo link cho loader: kiểm tra loại file, kiến trúc, interpreter và môi trường glibc/musl trước.

`readelf -h/-l` phù hợp file ELF; `sed -n '1l' file-script` với GNU sed giúp xem dòng đầu và ký tự khó thấy. Lệnh đọc không tự chứng minh script an toàn để chạy.

### 9.3. `error while loading shared libraries`, `undefined symbol`, `version ... not found`

Lỗi đầu thường liên quan tìm/nạp thư viện; lỗi symbol/phiên bản có thể do thư viện được tìm thấy nhưng không thỏa giao ước mà binary yêu cầu. Đọc NEEDED/RUNPATH, kiểm tra gói và loader. Kiểm tra `LD_LIBRARY_PATH`/môi trường của lần chạy thật, không chỉ môi trường terminal khác.

Không chữa bằng link `libX.so.2` sang `libX.so.1` chỉ vì thiếu tên: số đời có thể biểu thị ABI khác. Một file có cùng tên không đồng nghĩa cùng các symbol và hành vi. Binary không tin cậy không dùng ldd; phân tích metadata trước.

### 9.4. Xung đột phụ thuộc hoặc không có candidate

Dùng `apt-cache policy tên-gói`, xem nguồn, release, kiến trúc và pinning; dữ liệu kho có thể cũ hoặc nguồn không bật. Gói có thể bị giữ phiên bản (**hold**) hoặc có yêu cầu không thỏa; `apt-mark showhold` xem danh sách hold trên APT.

Mô phỏng kế hoạch trước lệnh sửa; đừng ép bỏ dependency hay thêm kho release khác để cài một công cụ. Giải quyết theo tài liệu distro và nguyên nhân thật, đặc biệt với thư viện nền.

### 9.5. Package manager đang bị khóa

**Lock (khóa)** là cơ chế ngăn các tiến trình cùng sửa cơ sở dữ liệu/trạng thái gói theo cách gây xung đột. Có thể updater nền đang làm việc. Không xóa file lock chỉ vì thấy tên file tồn tại; sự tồn tại của file và khóa đang được tiến trình giữ là hai việc khác nhau.

Xem thông báo chỉ tiến trình giữ khóa; nếu có `fuser`/`lsof`, chúng giúp xác định tiến trình đang dùng các đường dẫn lock được báo, và xem tiến trình đó làm gì. Việc xác định holder còn cần quyền và đọc trạng thái thật; không tự kill updater đang triển khai gói. Chờ thao tác hợp lệ hoàn thành hoặc chẩn đoán updater bị kẹt trước.

Nếu thao tác bị gián đoạn, `dpkg --audit` giúp xem trạng thái chưa hoàn tất. Các lệnh sửa như `dpkg --configure -a` hay `apt-get -f install` có thể cấu hình/chạy script/thay đổi gói, không phải lệnh chỉ đọc; chỉ dùng sau khi biết nguyên nhân, không còn giao dịch chạy và đã đọc kế hoạch phù hợp. Xem [Debian dpkg FAQ](https://wiki.debian.org/Teams/Dpkg/FAQ).

## 10. Tự kiểm tra và kết quả cần giữ

Giữ các báo cáo before/after, policy, header/dynamic của Python, mã `hello.c`, báo cáo thư viện của `hello` và thông tin venv nếu đã thử. Đạt bài khi tự chỉ ra được:

- Executable nào thực sự được dùng khi gọi tên lệnh và khi gọi đường dẫn trực tiếp.
- Gói sở hữu link và gói sở hữu file đích; nếu không tìm được thì nguyên nhân đã kiểm tra.
- Phiên bản gói, candidate và nguồn theo metadata; giới hạn của phép suy ra nguồn tải lịch sử.
- Loader ELF và dependency trực tiếp, cùng đường thư viện giải được của file mẫu tin cậy.
- Các công cụ đã cài, thay đổi trước/sau và phần thử nào chưa làm vì môi trường không đáp ứng.

Tự trả lời trước khi đối chiếu:

1. Chạy `apt update` xong, version của `python3` có bắt buộc tăng không?
2. `command -v python3` là `/usr/local/bin/python3`, trong khi dpkg có gói python3 installed. Hai thông tin có mâu thuẫn không?
3. Link `/usr/bin/python3` và file đích thuộc gói khác nhau có bất thường không?
4. PATH có thư mục chứa `libdemo.so.1` thì loader có nhất thiết tìm ở đó không?
5. `readelf -d` thấy NEEDED nghĩa là thư viện đã được cài và chắc chắn được nạp đúng không?
6. Kho có chữ ký hợp lệ có bảo đảm mã không có lỗi và tương thích release không?
7. Sau vá thư viện, chương trình mới báo version mới nhưng dịch vụ cũ chưa restart. Cần kiểm tra điều gì?
8. Một executable ELF64 có tự chạy được trên mọi CPU 64-bit không?
9. JSON về danh sách package/version đã lưu có đủ để rollback một migration cơ sở dữ liệu không?
10. Tại sao không dùng ldd trên binary tải từ nguồn chưa tin cậy, và không sửa Python distro bằng sudo pip?

**Tiêu chí đối chiếu:**

- Câu 1–3: update chỉ làm mới chỉ mục; PATH có thể chọn cài thủ công; link và đích là hai đường dẫn/đối tượng được đóng gói riêng.
- Câu 4–5: đường tìm executable khác đường tìm thư viện; metadata khai báo không chứng minh tài nguyên đã tìm/nạp đúng.
- Câu 6: chữ ký chứng minh chuỗi nguồn/nội dung trong phạm vi tin cậy, không thay kiểm thử chất lượng/ABI.
- Câu 7: xét mapping/danh tính/trạng thái tiến trình thật, yêu cầu restart hoặc reboot theo thành phần.
- Câu 8: kiểm tra Machine, loader, ABI và môi trường; số bit không đồng nghĩa kiến trúc.
- Câu 9: cần cả dữ liệu, cấu hình và cơ chế phục hồi nhất quán; downgrade mã không hoàn tác dữ liệu.
- Câu 10: ldd có thể dẫn tới thực thi; venv tách phạm vi quản lý dependency dự án khỏi thư viện Python do distro quản lý.

Bài tập mới: một dịch vụ chạy được trên máy A nhưng máy B báo `libdemo.so.1: cannot open shared object file`. Lập thứ tự kiểm tra: xác nhận cùng file/kiến trúc → xem loader/NEEDED và môi trường thật → tìm gói/phiên bản tương thích từ đúng nguồn → kiểm tra sau sửa. Giải thích vì sao tạo symlink hoặc sửa LD_LIBRARY_PATH toàn hệ thống chưa phải lời giải đủ căn cứ.

## 11. Tóm tắt mô hình cần nhớ

Kho cung cấp gói và metadata; APT chọn/tải theo phụ thuộc và chính sách; dpkg triển khai, cấu hình và theo dõi gói cục bộ. Shell chọn executable qua cách phân giải tên; kernel bắt đầu thực thi; loader tìm thư viện theo cơ chế riêng và yêu cầu ABI phù hợp.

“Có trong kho”, “đã cài”, “file tồn tại” và “tiến trình đang dùng mã đã cập nhật” là bốn trạng thái khác nhau. Kiểm chứng đúng lớp trước khi thay đổi. Bài 12 sẽ học process, thread và signal để quan sát sâu hơn chương trình đang thực sự chạy, thay vì chỉ file chương trình trên đĩa.

## Tài liệu kiểm chứng và đọc tiếp

- [Debian FAQ: package basics](https://www.debian.org/doc/manuals/debian-faq/pkg-basics.en.html), [package tools](https://www.debian.org/doc/manuals/debian-faq/pkgtools.en.html): mô hình gói và vai trò công cụ.
- [apt(8)](https://manpages.debian.org/trixie/apt/apt.8.en.html), [apt-get(8)](https://manpages.debian.org/trixie/apt/apt-get.8.en.html), [apt-cache(8)](https://manpages.debian.org/trixie/apt/apt-cache.8.en.html), [dpkg-query(1)](https://manpages.debian.org/trixie/dpkg/dpkg-query.1.en.html): lệnh tra cứu/cài và phạm vi kết quả.
- [apt-secure(8)](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html), [sources.list(5)](https://manpages.debian.org/trixie/apt/sources.list.5.en.html), [apt_preferences(5)](https://manpages.debian.org/trixie/apt/apt_preferences.5.en.html): tin cậy kho, nguồn và pinning.
- [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html), [ldd(1)](https://man7.org/linux/man-pages/man1/ldd.1.html), [GNU Binutils readelf](https://sourceware.org/binutils/docs/binutils/readelf.html): loader và phân tích ELF.
- [Python venv](https://docs.python.org/3/library/venv.html), [Python externally managed environments](https://packaging.python.org/en/latest/specifications/externally-managed-environments/): tách dependency dự án.
- [RPM manual](https://rpm.org/docs/6.0.x/man/rpm.8), [DNF5 documentation](https://dnf5.readthedocs.io/en/latest/): nhánh công cụ khác; chọn tài liệu đúng phiên bản distro.

`man` đọc trang hướng dẫn cài trên máy: `man apt`, `man apt-cache`, `man dpkg-query`, `man 8 ld.so`, `man readelf`. Số 8 chọn nhóm hướng dẫn quản trị, giúp tìm đúng trang loader. Nếu môi trường không có man, dùng trợ giúp công cụ và nguồn chính thức của bản tương ứng.
