# Bài 22 — LVM, RAID, mã hóa và bảo vệ dữ liệu

[Mục lục](../README.md) · [← Bài 21](21-storage-filesystem.md) · [Bài 23 →](23-driver-va-io.md)

## Mục tiêu: thêm dung lượng, chịu hỏng và phục hồi có phải cùng một việc?

Một thư mục dữ liệu gần đầy: bạn muốn tăng vùng chứa, không ngừng dịch vụ khi một ổ hỏng, không để người lấy ổ đọc được dữ liệu, và có thể quay lại trước khi xóa nhầm. Đây là bốn nhu cầu khác nhau. Sau bài này, bạn cần mô tả PV/VG/LV và hai bước mở rộng; hiểu thin pool/snapshot; chọn RAID theo loại lỗi; phân biệt mã hóa với backup; thực hành LV ext4 trên image riêng trong VM; đặt RPO/RTO rồi thử phục hồi dữ liệu tĩnh.

Cần bài 21. **Storage** là các lớp lưu trữ dữ liệu; **block device** là thiết bị cho phép truy cập các khoảng byte theo khối, có thể vật lý hoặc logic. **Filesystem** là cấu trúc tổ chức tên, thư mục, thuộc tính và nội dung file trên vùng ấy. **Mount** là gắn filesystem vào thư mục truy cập gọi là **mount point**; `findmnt -T /đường/dẫn` cho biết lớp đang chứa một đường dẫn. Mở rộng thiết bị logic không tự đồng nghĩa cấu trúc filesystem đã dùng thêm phần đó.

## 1. LVM giải quyết sự cố định của phân vùng bằng cách nào?

**Partition**, phân vùng, là khoảng được khai báo trong bảng chia ổ. **LVM**, Logical Volume Manager, là bộ công cụ quản lý các vùng khối logic trên một hoặc nhiều thiết bị. Công cụ lvm2 chạy ở **user space**, nơi các chương trình ngoài kernel chạy, để tạo cấu hình; **device mapper** là lớp trong **kernel**, phần lõi quản lý tài nguyên, thực hiện ánh xạ địa chỉ khối lúc đọc/ghi. LVM không thay filesystem và không yêu cầu mọi LV đều có ext4: LV cũng có thể dùng cho lớp khác.

**PV**, physical volume, là vùng thiết bị được đưa vào quản lý LVM, thường là partition hoặc một block device nguyên. “Physical” không bắt buộc là một ổ độc lập: loop image của lab cũng có thể làm PV. **VG**, volume group, gom nguồn dung lượng từ các PV để cấp cho các volume. **Extent** là đơn vị phân bổ của LVM; physical extent nằm ở PV, logical extent là đơn vị nhìn từ LV. **LV**, logical volume, là block device logic được cấp từ VG; filesystem dùng LV mà không cần biết mỗi extent thực ở vị trí nào.

```text
PV thứ nhất ─┐
             ├→ VG: kho các extent → LV data → ext4 → mount /data
PV thứ hai ──┘                    └→ LV logs → filesystem → mount /logs
```

Mũi tên là cấp/ánh xạ không gian, không phải nhân bản dữ liệu. Ở **linear LV**, các vùng logic được nối/ánh xạ tới các vùng PV; dùng nhiều PV không tự là RAID/mirror. Hỏng một PV có thể làm hỏng phần LV nằm trên nó và khiến filesystem không dùng được. Nếu cần dự phòng phải chọn cấu hình thích hợp; không coi “gom hai ổ” là “dữ liệu tự có hai bản”. Xem [LVM upstream](https://man7.org/linux/man-pages/man8/lvm.8.html).

Ví dụ minh họa: VG có tổng gần 768 MiB, LV data được cấp 192 MiB, phần còn lại chưa cấp. LVM giữ một ít dung lượng/metadata và làm tròn theo extent nên không yêu cầu tổng đúng từng byte. **Metadata** là dữ liệu mô tả cấu trúc, như LV ánh xạ vào PV nào; mất metadata hoặc PV có thể ảnh hưởng việc tìm dữ liệu, khác nội dung file bên trong.

Tự kiểm tra bằng các lệnh đọc (cần lvm2 và quyền nhìn thiết bị):

```bash
sudo pvs -o pv_name,vg_name,pv_size,pv_free
sudo vgs -o vg_name,pv_count,lv_count,vg_size,vg_free
sudo lvs -o lv_name,vg_name,lv_size,segtype,devices
```

`PSize/PFree` là dung lượng PV và phần chưa cấp; `VSize/VFree` là kho VG; `LSize` là kích thước LV; `segtype` cho loại ánh xạ, `devices` cho nguồn extent. Đọc từng lớp, không lấy VFree làm dung lượng trống bên trong ext4. Trong hệ không dùng LVM, bảng có thể rỗng; không cần tạo VG trên ổ thật để có dữ liệu minh họa.

## 2. Vì sao tăng LV rồi `df` vẫn chưa tăng?

`df` hỏi filesystem về không gian nó đang quản lý. `lvextend` tăng block device LV bằng cách cấp thêm extent, nhưng ext4 vẫn có các cấu trúc mô tả kích thước cũ đến khi grow filesystem. **Grow/resize** là mở rộng/đổi kích thước lớp tương ứng; từ “resize” chưa đủ chỉ đang sửa LV hay filesystem.

```text
Trước: VG còn rảnh → LV 192 MiB → ext4 dùng vùng 192 MiB
Bước 1 lvextend:  → LV 320 MiB → ext4 vẫn quản lý vùng cũ
Bước 2 resize2fs: → LV 320 MiB → ext4 quản lý vùng tăng thêm
```

Tình huống này không mất dữ liệu chỉ vì ext4 chưa grow, nhưng dung lượng mới chưa dùng được. Kiểm chứng bằng `lvs` cho lớp LV và `df` cho mount thực. `resize2fs` áp dụng ext2/3/4; online grow (grow khi mounted) còn tùy kernel và tính năng filesystem. XFS có `xfs_growfs` hướng tới filesystem đang mount, không dùng resize2fs; XFS không hỗ trợ shrink thông thường. Xem [resize2fs](https://man7.org/linux/man-pages/man8/resize2fs.8.html) và [lvextend](https://man7.org/linux/man-pages/man8/lvextend.8.html).

Có công cụ hỗ trợ `lvextend -r` để phối hợp filesystem resize trong các cấu hình được hỗ trợ; lab tách hai bước để quan sát ranh giới. Không lấy mở rộng làm khuôn để thu nhỏ: **shrink**, thu nhỏ, có nguy cơ cắt phần còn chứa dữ liệu. ext4 shrink cần **offline**, tức filesystem không đang mounted, theo quy trình phù hợp, filesystem phải thu trước vùng chứa; `lvreduce` sai có thể phá dữ liệu. Bài này không thực hiện shrink hoặc thử lvreduce.

Nếu VG không còn extent rảnh, lvextend không thể tự tạo dung lượng vật lý. Muốn thêm PV hoặc tăng lớp dưới phải làm một quy trình riêng có xác nhận thiết bị. Không cấp `+100%FREE` một cách máy móc nếu còn cần dự trữ cho volume khác/snapshot.

## 3. Thin provisioning và snapshot tiết kiệm chỗ nhưng rủi ro ở đâu?

**Thin provisioning**, cấp phát mỏng, cho phép volume có kích thước logic lớn nhưng chỉ cấp block dữ liệu vật lý khi dùng. **Thin pool** là kho dùng chung gồm vùng data và metadata để quản lý ánh xạ của các thin LV. Ví dụ pool thực có 100 GiB, hai LV nhìn thấy 80 GiB mỗi cái: tổng kích thước logic 160 GiB không tạo thêm 60 GiB thật. **Overprovisioning** là cấp tổng logic vượt khả năng vật lý, chỉ hợp lý khi có theo dõi và kế hoạch bổ sung trước khi dữ liệu thực vượt pool.

```text
LV A nhìn thấy 80 GiB ─┐
                      ├→ thin pool data 100 GiB + metadata ánh xạ
LV B nhìn thấy 80 GiB ─┘
```

Cả hai LV chia sẻ một giới hạn ở lớp pool. `df` trong A còn trống không bảo đảm pool còn chỗ; B có thể đã dùng nhiều hoặc metadata đầy trước data. Theo dõi bằng `sudo lvs -a -o lv_name,lv_size,segtype,data_percent,metadata_percent`: `Data%` và `Meta%` thuộc các loại volume hỗ trợ, không phải mọi LV đều có giá trị. Pool đầy có thể làm ghi bị trì hoãn, lỗi hoặc thay đổi trạng thái tùy chính sách; nhiều LV cùng chịu ảnh hưởng. Cảnh báo phải đặt ở cả data và metadata, không đợi mọi df đầy. Xem [lvmthin](https://man7.org/linux/man-pages/man7/lvmthin.7.html) cho hành vi và phiên bản, lab cơ bản dùng LV thường để tránh thêm cơ chế này.

**Copy-on-write (CoW)** là cơ chế giữ phần cũ/chia sẻ và cấp phần mới khi thay đổi theo thiết kế lớp đó.

**Snapshot** là khả năng đọc trạng thái một lớp tại mốc tạo ảnh. Với snapshot CoW truyền thống của LVM, vùng snapshot giữ dữ liệu cũ của các block thay đổi từ mốc đó; vùng giữ thay đổi đầy có thể làm snapshot mất hiệu lực. Thin snapshot dùng cơ chế chia sẻ ánh xạ/block của thin pool, không có cùng mô hình dung lượng cố định riêng như snapshot truyền thống. Không áp một lệnh/hành vi cho cả hai.

Tạo snapshot không có nghĩa đã copy toàn bộ dữ liệu sang một ổ khác. Snapshot có thể giúp đọc dữ liệu ổn định để tạo backup, nhưng ứng dụng đang ghi nhiều file cần chuẩn bị riêng. **Crash-consistent** là trạng thái có thể giống như hệ thống bị dừng đột ngột tại một mốc; **application-consistent** là trạng thái ứng dụng đã hoàn tất các bước cần để phục hồi nghiệp vụ đúng. Snapshot lớp khối không tự hiểu các giao dịch database để bảo đảm application consistency.

Nếu snapshot và bản gốc nằm trên cùng ổ/pool, hỏng lớp chứa chúng có thể mất cả hai: đó là cùng **failure domain**, miền chịu chung một sự cố. Snapshot giúp quay lại một số thay đổi, không tự là backup độc lập. Không xóa snapshot chưa xác định vì có thể vẫn là nguồn của backup đang đọc.

## 4. RAID giúp chịu hỏng nào, và không chịu hỏng nào?

**RAID** là tổ chức nhiều thiết bị thành lớp lưu trữ có cơ chế phân bố/dự phòng tùy level. **Stripe** là chia các phần dữ liệu qua nhiều thiết bị để có thể xử lý song song; **mirror** là giữ các bản dữ liệu tương ứng trên nhiều thiết bị; **parity** là phần thông tin dư được tính để tái dựng dữ liệu khi thiếu số thành phần trong giới hạn. RAID có thể do kernel Linux MD, lớp LVM RAID hoặc bộ điều khiển phần cứng thực hiện; không suy ra cùng level nghĩa là cùng đường quản lý.

Bảng minh họa với ổ thành viên có kích thước bằng nhau, không tính metadata/spare; dung lượng thực còn tùy bố trí:

| Level | Cơ chế và dung lượng gần đúng | Khả năng chịu hỏng có điều kiện |
|---|---|---|
| RAID 0 | Stripe, tổng N ổ | Không dự phòng; hỏng một thành viên có thể mất cả mảng |
| RAID 1 | Mirror, gần dung lượng một ổ với các bản bằng nhau | Có thể tiếp tục khi vẫn còn bản hợp lệ, không chỉ dựa số ổ danh nghĩa |
| RAID 5 | Stripe + một mức parity, gần `(N-1) × cỡ ổ`, thường tối thiểu 3 | Chịu thiếu một ổ theo cấu hình đúng, lỗi đọc thêm khi rebuild có thể vượt khả năng |
| RAID 6 | Hai mức parity, gần `(N-2) × cỡ ổ`, thường tối thiểu 4 | Chịu thiếu hai ổ theo mô hình level, không bảo vệ mọi kiểu hỏng dữ liệu |
| RAID 10 | Stripe kết hợp mirror, kiểu bốn ổ phổ biến gần nửa tổng | Tổ hợp ổ hỏng quyết định; hai ổ cùng cặp mirror có thể làm mất dữ liệu |

Kết luận của bảng: chọn theo yêu cầu và kiểu triển khai, không nhớ “RAID10 luôn chịu được hai ổ”. Với Linux MD RAID10 có nhiều layout ngoài cặp mirror phổ biến; cần đọc layout thật. **Degraded** là trạng thái mảng còn hoạt động nhưng thiếu mức dự phòng mong muốn. **Rebuild/resync** là quá trình tái dựng/đồng bộ dữ liệu thành viên; nó đọc/ghi nhiều, tăng tải và là giai đoạn cần giám sát. Thêm ổ thay thế không làm dữ liệu an toàn tức thì trước khi tái dựng hoàn tất.

Tự quan sát trên máy đã có Linux MD (chỉ đọc): `cat /proc/mdstat` cho trạng thái các mảng và tiến độ; `sudo mdadm --detail /dev/mdX` chỉ dùng sau xác định tên mảng thật. Nếu không có MD, /proc/mdstat trống hoặc không tồn tại không chứng minh máy không có RAID phần cứng/LVM RAID. Xem [md(4)](https://man7.org/linux/man-pages/man4/md.4.html) và [kernel MD admin guide](https://docs.kernel.org/admin-guide/md.html).

Ví dụ hai ổ mirror nhận lệnh xóa `invoice.csv`: thao tác hợp lệ đó được phản ánh lên cả hai. RAID giúp một số hỏng thiết bị, không giữ phiên bản cũ để cứu xóa nhầm, ransomware (chương trình mã hóa/phá dữ liệu trái ý muốn), lỗi ứng dụng hoặc sự cố chung nguồn/cháy. Không tháo ổ thật để kiểm tra bảng; mô hình RAID ở đây là lý thuyết và quan sát nếu hệ đã có cấu hình.

## 5. LUKS/dm-crypt có phải khóa quyền đọc của mọi ứng dụng?

**Mã hóa dữ liệu lưu trữ**, encryption at rest, biến dữ liệu trên phương tiện thành dạng phải có khóa mới giải ra nội dung. **dm-crypt** là lớp device mapper thực hiện mã hóa/giải mã block; **LUKS** là định dạng quản lý thông tin mã hóa và khóa để công cụ cryptsetup tổ chức mở khóa. **Passphrase** là cụm mật khẩu dùng để mở một phương án truy cập khóa, không nên đơn giản hóa thành từng block được mã hóa trực tiếp bằng chuỗi bạn gõ.

```text
Trước mở khóa: thiết bị chứa dữ liệu mã hóa
                         │ cryptsetup dùng thông tin LUKS + khóa hợp lệ
                         ▼
Sau mở khóa: thiết bị ánh xạ /dev/mapper/... nhìn thấy dữ liệu giải mã
                         → filesystem → process có quyền truy cập
```

**Process** là một lần chạy chương trình; **permission** là quyền đọc/ghi/thực thi theo danh tính và chính sách hệ thống. Khi vùng mã hóa đã mở, process được phép đọc filesystem có thể lấy dữ liệu rõ. **Root** là tài khoản quản trị rộng quyền, khác “root filesystem” gốc cây `/`. Mã hóa không thay quyền file, xác thực người dùng hay phòng vệ máy đã bị chiếm quyền.

**LUKS header** là vùng metadata quan trọng của định dạng, chứa thông tin để sử dụng các phương án khóa; **recovery key**, khóa phục hồi, là cách mở thay thế được thiết kế và giữ an toàn. Mất khóa hoặc thông tin cần thiết có thể khiến dữ liệu không phục hồi được. Backup header phải được bảo vệ cùng với thiết kế khóa; không xem nó là file cấu hình có thể công khai. Khôi phục header cũ cũng có hệ quả đối với việc quản lý khóa đã thu hồi. Xem [cryptsetup FAQ](https://gitlab.com/cryptsetup/cryptsetup/-/wikis/FrequentlyAskedQuestions) và [kernel dm-crypt](https://www.kernel.org/doc/html/latest/admin-guide/device-mapper/dm-crypt.html).

Một bố trí có thể là RAID → vùng LUKS mở → PV/VG/LV → filesystem, bố trí khác đặt mã hóa ở vị trí khác. Đường khối logic xuống vật lý khác thứ tự các thao tác tạo; hãy vẽ theo cấu hình thật. `lsblk -f` có thể hiện lớp `crypto_LUKS` và `crypt`, không xác nhận passphrase/recovery key tốt hoặc mọi file đã mã hóa ở đúng lớp. Bài này không yêu cầu `luksFormat` hay tạo/xóa keyslot trên host.

## 6. Lab VM: mở rộng LV ext4 trên một image

### 6.1. Chuẩn bị và kiểm tra chưa có VG trùng tên

Chỉ thực hiện trong VM riêng có sudo, util-linux, lvm2 và e2fsprogs; không dùng passthrough ổ host. Lab tạo cấu trúc LVM có tên `coursevg`; nếu đã có VG ấy, không tiếp tục và không xóa để lấy tên. Chạy từng bước, đọc mã lỗi trước đi tiếp; **shell** là trình diễn giải lệnh, biến của shell chỉ còn trong phiên hiện tại. Khi mở terminal khác, không tự gán lại loop từ ví dụ.

```bash
command -v pvcreate
command -v vgcreate
command -v lvcreate
command -v resize2fs
sudo vgs -o vg_name,vg_uuid,vg_size,vg_free
mkdir -p "$HOME/linux-lab/lvm"
pv_image=$(mktemp "$HOME/linux-lab/lvm/pv.XXXXXX.img")
truncate -s 768M "$pv_image"
pv_loop=$(sudo losetup --find --show "$pv_image")
printf 'Image=%s\nLoop=%s\n' "$pv_image" "$pv_loop"
sudo losetup --list --output NAME,BACK-FILE "$pv_loop"
```

`mktemp` tạo file riêng mới, `truncate` đặt kích thước logic (có thể sparse, tức chưa chiếm đủ block thật), `losetup` gắn file vào loop block device. **Đối chiếu NAME đúng `$pv_loop`, BACK-FILE đúng image mới tạo và VG coursevg chưa tồn tại trước khi viết metadata.** Nếu thiếu công cụ hoặc biến rỗng/lệnh lỗi, dừng. Đừng thay loop bằng một tên disk trong lsblk.

LVM của một số distro hạn chế thiết bị bằng filter hoặc devices file, có thể từ chối scan loop. Khi gặp `device excluded`/không tìm thấy PV, đọc cấu hình và tài liệu bản lvm2; không sửa global filter trên máy thật để vượt lỗi. Có thể dùng VM riêng khác cho phép loop hoặc thêm một disk ảo rỗng chuyên dụng trong VM rồi làm quy trình xác minh riêng; lệnh bên dưới chỉ dành cho loop đã xác nhận, không ngầm áp cho disk thay thế.

### 6.2. Tạo PV, VG, LV và filesystem

```bash
sudo pvcreate "$pv_loop"
sudo vgcreate coursevg "$pv_loop"
sudo lvcreate -L 192M -n data coursevg
sudo pvs -o pv_name,vg_name,pv_size,pv_free
sudo lvs -o lv_name,vg_name,lv_size,segtype,devices coursevg
```

`pvcreate` ghi metadata PV; `vgcreate` lập VG; `lvcreate -L 192M -n data` cấp LV data. Cần thấy PV đúng loop, VG coursevg, LV data khoảng 192 MiB, loại thường linear, devices chỉ PV của lab. Nếu lệnh đề nghị ghi đè chữ ký bất ngờ hoặc phát hiện dữ liệu cũ, dừng để kiểm tra; không thêm force/yes cho qua.

Sau khi đối chiếu đúng LV mới tạo:

```bash
sudo mkfs.ext4 /dev/coursevg/data
lv_mount=$(mktemp -d /tmp/linux-lvm.XXXXXX)
sudo mount /dev/coursevg/data "$lv_mount"
findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS "$lv_mount"
printf 'LVM lab retained\n' | sudo tee "$lv_mount/check.txt" >/dev/null
df -h "$lv_mount"
sudo vgs -o vg_name,vg_size,vg_free coursevg
```

`/dev/coursevg/data` có thể là symlink tới device mapper, nên findmnt có thể in `/dev/mapper/coursevg-data`; xác nhận đó là cùng LV. Mount thất bại thì không ghi check.txt, vì thư mục tạm chưa có filesystem LV. `df` trước tăng là mốc ext4, `vgs VFree` là mốc dung lượng chưa cấp của VG. Chúng là hai phép đo khác lớp.

### 6.3. Quan sát sau từng bước tăng

```bash
sudo lvextend -L +128M /dev/coursevg/data
sudo lvs -o lv_name,lv_size,devices coursevg
df -h "$lv_mount"
sudo resize2fs /dev/coursevg/data
df -h "$lv_mount"
sudo cat -- "$lv_mount/check.txt"
```

Dấu `+` trong `+128M` là thêm 128 MiB vào kích thước đang có, không đặt tổng thành 128 MiB. Kết quả minh họa: `LSize` từ `192.00m` thành `320.00m`; df ngay sau lvextend vẫn gần số cũ, sau resize2fs tăng. `df` Size không buộc đúng 192/320 do overhead và cách làm tròn; dùng cùng phép đo trước/sau. File phải còn nội dung `LVM lab retained`. Nếu resize2fs lỗi, LV có thể đã lớn hơn nhưng filesystem chưa grow; ghi lại lỗi, không chạy lvreduce để “trả về” theo phỏng đoán.

Bạn kiểm chứng hai thay đổi và dữ liệu giữ lại, chưa chứng minh mọi kiểu mở rộng online/thiết bị/filesystem đều an toàn. Lab LV thường trên loop không mô phỏng hiệu năng nhiều ổ, RAID hoặc thin pool.

### 6.4. Dọn theo chiều ngược và kiểm tra từng lớp

Chỉ dọn khi dữ liệu lab không còn cần, tên/path được xác nhận là của lab, không có volume khác trong VG. Không dùng `-y` để tự vượt lời hỏi xóa; công cụ yêu cầu xác nhận vì các thao tác này làm dữ liệu không truy cập được.

```bash
cd "$HOME"
sudo umount "$lv_mount"
sudo lvs -o lv_name,vg_name,devices coursevg
sudo lvremove /dev/coursevg/data
sudo vgremove coursevg
sudo pvremove "$pv_loop"
sudo losetup -d "$pv_loop"
sudo losetup -j "$pv_image"
rmdir "$lv_mount"
```

Dừng nếu unmount lỗi busy; tìm process đang dùng như bài 21, không tháo PV bên dưới filesystem đang dùng. Kiểm tra lvs chỉ có đúng data của lab trước lvremove/vgremove. Sau losetup -j không còn loop liên quan, mới `rm -- "$pv_image"`. Nếu gặp lỗi giữa chừng, chỉ dọn những lớp đã tạo thành công và xác minh lại bằng pvs/vgs/lvs; không đoán rằng mọi bước sau thất bại đã được rollback tự động.

## 7. Backup giải quyết điều mà mirror/snapshot chưa giải quyết ra sao?

**Backup** là bản sao phục vụ khôi phục theo chính sách; **restore** là đưa dữ liệu từ bản sao trở lại môi trường sử dụng; **recovery** còn gồm đưa ứng dụng/dịch vụ về trạng thái hoạt động đúng. File archive tạo thành công chỉ là một đầu vào của recovery. **Retention** là chính sách giữ bao nhiêu phiên bản và trong bao lâu; quá ngắn có thể mất bản trước khi phát hiện lỗi, quá dài tốn dung lượng và kéo dài giữ dữ liệu nhạy cảm.

**RPO**, Recovery Point Objective, là giới hạn mất dữ liệu chấp nhận được theo khoảng thời gian giữa mốc dữ liệu phục hồi và sự cố. **RTO**, Recovery Time Objective, là thời gian khôi phục chấp nhận được theo phạm vi bạn định nghĩa. Hai mục tiêu phải nêu ứng dụng/dữ liệu và cách đo, không chỉ số chung cho toàn công ty.

Ví dụ: dữ liệu bài tập có RPO 24 giờ, RTO 1 giờ. Backup hoàn tất mỗi ngày có thể đáp ứng khoảng mất dữ liệu trong điều kiện lịch và bản sao thành công; một ngày backup lỗi có thể phá kỳ vọng này. RTO gồm tìm bản phù hợp, lấy dữ liệu, giải nén, kiểm tra và đưa công việc về dùng được, không chỉ thời gian tar extract. Với database có RPO phút/giây, cần cơ chế log/backup của ứng dụng; không dùng tar thư mục đang ghi để hứa mức đó.

| Cơ chế | Vấn đề chính nó giúp xử lý | Vẫn cần bổ sung |
|---|---|---|
| LVM | Quản lý/cấp dung lượng logic | Khả năng chịu hỏng và phục hồi dữ liệu |
| RAID | Một số hỏng thành viên, tùy level/layout | Phiên bản trước xóa nhầm và bản ngoài miền sự cố |
| Mã hóa | Bảo vệ dữ liệu lưu khi thiếu khóa hợp lệ | Khóa phục hồi, quyền khi đã mở, backup |
| Snapshot | Trạng thái tại mốc, giúp đọc/rollback có điều kiện | Bản độc lập và tính nhất quán ứng dụng |
| Backup độc lập đã restore thử | Phục hồi các phiên bản theo chính sách | Theo dõi, giữ khóa/cấu hình và diễn tập recovery |

**Độc lập** phải xét loại sự cố: thư mục khác trên cùng ổ không độc lập trước ổ chết; một ổ khác cùng máy chưa độc lập trước mất cả máy; cùng tài khoản có quyền xóa mọi bản không độc lập trước xóa hàng loạt. Bản offline/immutable hoặc kho có phân quyền tách biệt có thể cải thiện một số rủi ro nhưng vẫn cần quy trình kiểm chứng; immutable nghĩa là hạn chế sửa/xóa trong khoảng/chính sách, không tự bảo đảm mọi dữ liệu backup hợp lệ.

Backup metadata VG bằng `vgcfgbackup` giúp giữ mô tả LVM, **không sao lưu nội dung file trong LV**. Một VG được phục hồi cấu trúc nhưng PV đã mất byte dữ liệu thì metadata không tự dựng lại chúng. Mã hóa backup cũng đòi giữ khóa/recovery key ngoài đường hỏng của bản chính theo thiết kế an toàn.

## 8. Lab không sudo: chứng minh một bản sao cứu được phiên bản cũ

Lab chỉ có file văn bản tĩnh, GNU tar/diff và thư mục mới. Archive tạm cùng máy phục vụ minh họa, không gọi là backup độc lập production. Không thực hiện trên dữ liệu ứng dụng đang ghi.

```bash
backup_lab=$(mktemp -d "$HOME/backup-lab.XXXXXX")
mkdir -- "$backup_lab/source" "$backup_lab/restore"
printf 'approved version\n' > "$backup_lab/source/report.txt"
tar -czf "$backup_lab/copy.tar.gz" -C "$backup_lab/source" .
printf 'wrong replacement\n' > "$backup_lab/source/report.txt"
tar -xzf "$backup_lab/copy.tar.gz" -C "$backup_lab/restore"
cat -- "$backup_lab/source/report.txt" "$backup_lab/restore/report.txt"
```

Dừng nếu mỗi bước báo lỗi trước đi tiếp. **Archive** là file gộp cây dữ liệu; `-c` tạo, `-x` extract, `-z` gzip, `-f` tên archive, `-C` chọn thư mục. Đọc hai dòng: nguồn hiện tại `wrong replacement`, bản phục hồi `approved version`. Mục tiêu là chứng minh có phiên bản cũ sau thay đổi hợp lệ; RAID mirror sẽ phản ánh thay đổi mới, còn archive cũ không được ghi đè trong lab.

Kiểm tra độc lập kỳ vọng phục hồi:

```bash
printf 'approved version\n' > "$backup_lab/expected.txt"
diff -- "$backup_lab/expected.txt" "$backup_lab/restore/report.txt"
printf 'restore diff status=%s\n' "$?"
```

Không khác biệt và mã `0` là nội dung mẫu đúng; chưa kiểm tra metadata/quyền/database. Đo thời gian các bước nếu muốn tập đặt RTO, nhưng file vài byte không đại diện TB dữ liệu qua mạng. Khi dọn, xóa đúng bốn file report/restore/expected/archive đã tạo rồi rmdir các thư mục mới; giữ lại nếu muốn báo cáo. Không xóa dữ liệu thật để thử backup.

## 9. Lỗi thường gặp và câu hỏi tự kiểm tra

| Dấu hiệu | Cách kiểm tra đúng lớp |
|---|---|
| lvs lớn hơn, df chưa tăng | Đúng mount? resize filesystem đã thành công? |
| VG báo hết free nhưng df còn | Extent đã cấp cho LV khác, khác không gian trong FS |
| Thin LV còn nhiều chỗ, ghi lỗi | Data%/Meta% pool và chính sách lỗi, không chỉ df |
| Snapshot mất hiệu lực | Loại snapshot, vùng giữ thay đổi/pool và cảnh báo |
| RAID degraded | Thành viên/layout và tiến độ rebuild, không chỉ còn mount được |
| LUKS không mở | Khóa và header/phạm vi thiết bị; không format lại để “sửa” |
| Restore thiếu dữ liệu ứng dụng | Nhất quán ứng dụng, phiên bản backup, khóa/cấu hình và phép thử nghiệp vụ |

1. LV 320 MiB nhưng ext4 192 MiB có mâu thuẫn không? **Tiêu chí:** không, hai lớp; kiểm tra lvs/df và resize.
2. VG gom hai PV linear, vậy chịu được hỏng một PV? **Tiêu chí:** không tự có dự phòng, phải đọc ánh xạ/loại LV.
3. Pool 100 GiB, hai thin LV 80 GiB mỗi cái, có 160 GiB thật? **Tiêu chí:** không, cần giám sát dung lượng đã cấp thực và metadata.
4. RAID10 bốn ổ hỏng hai ổ: dữ liệu chắc còn? **Tiêu chí:** tùy layout/tổ hợp, hai ổ cùng bản sao cần thiết có thể làm mất.
5. Có snapshot cùng ổ, mất cả ổ: phục hồi từ đâu? **Tiêu chí:** cần bản ngoài miền lỗi, snapshot không tự độc lập.
6. Vùng LUKS đang mở và root bị chiếm quyền: mã hóa đã ngăn đọc chưa? **Tiêu chí:** không, mã hóa lưu trữ khác quyền khi đã mở.
7. `vgcfgbackup` thành công, có thể xóa LV mà vẫn restore file? **Tiêu chí:** không, đó là metadata LVM, không nội dung.
8. Backup mỗi ngày nhưng restore thử mất bốn giờ trong khi RTO một giờ. Thiết kế đạt chưa? **Tiêu chí:** chưa; số lịch không thay kết quả recovery thực.

Bạn đạt khi có bảng PV/VG/LV và df trước/sau từng bước, file check giữ nguyên, cleanup xác nhận đúng lớp; đồng thời có kế hoạch RPO/RTO, retention, miền sự cố và phép thử restore cho dữ liệu cụ thể. Ghi rõ phần VM đã thực hiện và phần chỉ mô hình, không khẳng định RAID/mã hóa được kiểm thử nếu chưa làm.

Mô hình tự nhắc: LVM thay ánh xạ/kích thước; filesystem tổ chức file; RAID thêm dự phòng có điều kiện; mã hóa bảo vệ lúc lưu; snapshot giữ mốc; backup/recovery đưa dữ liệu và dịch vụ trở lại theo mục tiêu đã kiểm chứng. Bài 23 lần theo driver và đường I/O để biết lúc nào lời gọi ghi mới chỉ vào bộ nhớ và lúc nào đã yêu cầu độ bền.

## Nguồn và phạm vi phiên bản

- [LVM](https://man7.org/linux/man-pages/man8/lvm.8.html), [lvmthin](https://man7.org/linux/man-pages/man7/lvmthin.7.html), [lvextend](https://man7.org/linux/man-pages/man8/lvextend.8.html): tài liệu dự án lvm2 được xuất bản trên man7.
- [resize2fs](https://man7.org/linux/man-pages/man8/resize2fs.8.html), [XFS grow](https://man7.org/linux/man-pages/man8/xfs_growfs.8.html): cách grow theo filesystem.
- [Linux MD](https://docs.kernel.org/admin-guide/md.html), [md(4)](https://man7.org/linux/man-pages/man4/md.4.html): level/layout và trạng thái mảng.
- [cryptsetup FAQ](https://gitlab.com/cryptsetup/cryptsetup/-/wikis/FrequentlyAskedQuestions), [dm-crypt](https://www.kernel.org/doc/html/latest/admin-guide/device-mapper/dm-crypt.html): mã hóa, khóa và ranh giới bảo vệ.

Đối chiếu `lvm version`, `man lvm`, `man lvextend`, `man lvmdevices`, `man cryptsetup` trên bản cài. Thiết bị loop, filter/devices file, online resize và option có thể khác theo distro/kernel/công cụ; không thay đổi cấu hình toàn hệ thống để ép ví dụ chạy.
