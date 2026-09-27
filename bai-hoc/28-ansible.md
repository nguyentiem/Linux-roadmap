# Bài 28 — Tự động hóa cấu hình với Ansible

[Mục lục](../README.md) · [← Bài 27](27-hardening-va-ban-va.md) · [Bài 29 →](29-observability.md)

## Mục tiêu: viết trạng thái cần có thay vì nhớ từng lệnh đã chạy

Bạn vừa cấu hình một dịch vụ trên máy thử. Khi có máy thứ hai, chép các lệnh thủ công có thể quên bước, đặt quyền khác hoặc khởi động lại không cần thiết. Sau một tuần, một người sửa file bằng tay; làm sao biết máy lệch khỏi cấu hình chuẩn và đưa nó trở lại?

**Ansible** là công cụ tự động hóa tác vụ và cấu hình: bạn viết mô tả, công cụ kết nối tới các máy rồi thực hiện công việc tương ứng. **Desired state — trạng thái mong muốn** là kết quả cần có, ví dụ “file chứa đúng một thông điệp, quyền 0644”, thay vì “thêm một dòng mỗi lần chạy”. **Configuration management — quản lý cấu hình** là duy trì máy/dịch vụ theo trạng thái ấy và phát hiện/sửa sai lệch.

Sau bài này, bạn cần đọc inventory/playbook, giải thích kết quả changed, kiểm chứng chạy lại và sửa drift, phân biệt dự báo check mode với thử thật, lập quy trình mở rộng có kiểm soát. Cần bài 13, 15, 27. Lab cơ bản quản lý file trong thư mục riêng trên localhost; không cần sudo và không thay dịch vụ hệ thống.

## 1. Ai điều khiển ai, và công cụ chạy ở đâu?

**Control node — máy điều khiển** chạy Ansible và giữ các mô tả cấu hình. **Managed node — máy được quản lý** nhận tác vụ. **Host — máy/đối tượng đích** là một mục trong danh sách quản lý; tên host trong inventory có thể là bí danh thay vì tên mạng thật.

**Inventory — danh sách đích và cách kết nối** gom host theo nhóm, như `lab` hoặc `web`. **SSH — giao thức truy cập từ xa có mã hóa** thường được dùng để kết nối máy Linux; **local connection — kết nối cục bộ** thực hiện ngay trên máy điều khiển. Localhost không tạo cách ly: nếu tác vụ sửa `/etc`, nó sửa `/etc` của máy đang chạy, dù mang tên “lab”.

```text
Máy điều khiển
   Inventory: chọn đúng host và cách kết nối
   Playbook: chọn việc và trạng thái mong muốn
                    |
                    v
          Module thực hiện trên host đích
                    |
                    v
          Kết quả: ok / changed / failed
                    |
                    v
          Kiểm tra trạng thái và chức năng thật
```

Đọc từ trên xuống: chọn đích trước, rồi thực hiện; đầu ra công cụ chưa thay bước kiểm tra dịch vụ. Một lỗi inventory có thể làm tác vụ đúng chạy trên máy sai, nên bước `--list-hosts` ở lab quan trọng.

**Module — đơn vị công cụ thực hiện một loại tác vụ** như tạo thư mục, chép file hoặc quản lý dịch vụ. Với nhiều module Linux thường dùng, Python cần có trên máy đích; không phải mọi module/kết nối có cùng yêu cầu. **ansible-core** cung cấp lõi chạy và module tích hợp; gói **ansible** có thể bổ sung tập collection. **Collection — bộ module/plugin theo tên miền** giúp tổ chức công cụ. **FQCN — tên đầy đủ của module**, như `ansible.builtin.copy`, chỉ rõ bộ cung cấp để tránh trùng tên. [Mô hình playbook của Ansible](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_intro.html).

Kiểm tra công cụ có mặt và bản đang chạy:

```bash
command -v ansible-playbook ansible-doc
ansible-playbook --version
```

`command -v` chỉ tìm lệnh trong môi trường hiện tại, không kiểm tra SSH hay quyền máy đích. Nếu chưa cài, dùng hướng dẫn Ansible phù hợp Python/distro; nên dùng môi trường công cụ riêng trên VM học, không pha phiên bản ngẫu nhiên vào máy vận hành. **Distro — bản phân phối Linux** đóng gói phần mềm và cấu hình; điều kiện cài khác theo phiên phát hành.

## 2. Play, task, variable và template nối nhau thế nào?

**Playbook — tập mô tả các lượt cấu hình** là file dạng **YAML — định dạng dữ liệu văn bản dùng thụt dòng**. Một **play — lượt áp dụng** chọn nhóm host rồi liệt kê tác vụ. **Task — tác vụ** gọi một module với dữ liệu cụ thể. Theo cách chạy mặc định, tác vụ được thực hiện theo thứ tự; các chế độ chiến lược khác có thể thay cách phối hợp giữa host.

**Variable — biến** là giá trị có tên để tham số hóa, ví dụ `course_message`. **Template — khuôn tạo file** kết hợp văn bản với biến; **Jinja** là cú pháp Ansible dùng cho biểu thức như `{{ course_message }}`. Với file ngắn ta dùng `copy.content`; với file cấu hình dài thường dùng module `template` và file khuôn riêng.

Một ví dụ khái niệm: inventory chọn `web`, biến đặt cổng 8080, template tạo file cấu hình, module kiểm tra/chuyển nội dung đến máy đích. Đổi một biến không tự chứng minh ứng dụng hỗ trợ giá trị đó: phải kiểm tra cấu hình bằng công cụ của ứng dụng.

**Become — chuyển sang danh tính có quyền cần thiết** cho phép tác vụ chạy dưới user khác, thường qua sudo. **Root — tài khoản quản trị** có quyền rộng; **sudo** thực hiện lệnh theo chính sách quyền. `become: true` không tự cấp quyền và không chỉ tác động máy điều khiển: nó áp cho tác vụ trên đích theo cấu hình. Lab cơ bản đặt `become: false`; nhánh quản lý `/srv` hay systemd mới cần xét quyền. [Ansible become](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_privilege_escalation.html).

## 3. Idempotency là chạy lại không đổi gì hay không cần làm gì?

**Idempotency — tính áp dụng lại vẫn giữ cùng kết quả cuối** nghĩa là khi trạng thái mong muốn đã có, chạy cùng mô tả không tạo thay đổi vô nghĩa tiếp. **Drift — sai lệch khỏi cấu hình chuẩn** là trạng thái bị sửa ngoài mô tả, như người dùng đổi nội dung file bằng tay.

Module `copy` có thể so nội dung hiện tại với nội dung cần có. Nếu khác, nó sửa rồi báo `changed`; nếu giống và thuộc tính cũng đúng, nó báo `ok` không changed. Nếu file có đúng nội dung nhưng sai quyền, vẫn có thay đổi hợp lệ. [Module copy](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/copy_module.html).

So với lệnh `echo ... >> file`: dấu `>>` nối thêm vào cuối, nên mỗi lần chạy có thêm một dòng. Trong khi đó desired state “file có đúng nội dung X” thay nội dung về X và lần sau không nối thêm. Module chuyên dụng thường dễ đạt idempotency hơn một chuỗi shell; không phải mọi module hoặc playbook tự có tính này.

**Changed — có thay đổi do tác vụ báo cáo** là thông tin module cung cấp. **changed_when — điều kiện tự đặt để báo changed** có thể thay thông tin đó nhưng không ngăn thao tác thật; đặt `changed_when: false` cho một lệnh vẫn sửa file chỉ làm báo cáo mất trung thực. Chứng minh idempotency cần vừa xem recap vừa kiểm tra trạng thái thực.

Một tác vụ đọc hoặc gathering facts vẫn có thể chạy lại dù `changed=0`. **Facts — thông tin được thu từ máy đích** như OS hoặc mạng; không nhất thiết cần trong lab file đơn giản nên ta tắt `gather_facts`. Zero changed không chứng minh ứng dụng đang khỏe, chỉ mô tả các tác vụ đã báo không thay đổi trong lần ấy.

## 4. Check mode có phải thử thật nhưng miễn phí?

**Check mode — chế độ dự báo thay đổi**, gọi bằng `--check`, yêu cầu module hỗ trợ kiểm tra mà không áp thay đổi. **Diff — khác biệt trước/sau** qua `--diff` giúp nhìn nội dung dự định thay. **Syntax check — kiểm tra cú pháp** chỉ kiểm tra mô tả có đọc được và cấu trúc phù hợp, không chạy thử ứng dụng.

Các giới hạn cần nhớ trước khi chạy:

- Module không hỗ trợ check mode có thể bị bỏ qua; kết quả không bao phủ toàn playbook.
- Tác vụ dựa vào kết quả của thay đổi trước có thể không có dữ liệu mong đợi; ví dụ thư mục chỉ “sẽ được tạo” nên file bên trong chưa có parent thật.
- Tác vụ khai `check_mode: false` vẫn có thể thực hiện thật ngay trong lần dùng `--check`; plugin/module tùy biến cũng phải được xem xét. Không coi cờ ấy là môi trường cách ly.
- Diff có thể hiện secret; **secret — thông tin bí mật** như token/mật khẩu không phù hợp in vào terminal/log. `no_log` hoặc `diff: false` có vai trò riêng, không tự bảo vệ dữ liệu đã ghi vào Git.

Vì thế thứ tự hợp lý là xem host/tasks → cú pháp → dự báo theo hỗ trợ → thực thi trên phạm vi thử → kiểm tra thật. [Tài liệu check/diff chuyên biệt](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html).

## 5. Lab: một file trong thư mục riêng, không đụng cấu hình host

### 5.1. Chuẩn bị đích và inventory

Điều kiện: Ansible/Python phù hợp đã cài, Bash và một phiên người dùng thường. **Shell — trình nhận lệnh** như Bash chạy các lệnh. **Localhost — máy cục bộ** ở đây dùng connection local. **Permission — quyền đọc/ghi/thực thi** giới hạn ai thao tác file; lab quản lý file của chính user.

```bash
lab_dir=$(mktemp -d)
printf 'Lab directory: %s\n' "$lab_dir"
cd "$lab_dir" || exit 1
mkdir -m 0755 managed
```

`mktemp -d` tạo thư mục riêng. Tạo `managed` trước để parent tồn tại thật ngay khi check mode dự báo; playbook vẫn quản lý trạng thái/quyền của nó. Giữ nguyên thư mục cho hai lần chạy để so sánh, không tạo một đích mới mỗi lần.

Lưu `inventory.ini` trong thư mục này:

```ini
[lab]
localhost ansible_connection=local
```

`[lab]` là nhóm; localhost là host duy nhất; biến `ansible_connection=local` ngăn dùng SSH cho lab. Chạy từ thư mục riêng giúp giảm khả năng nhầm file cấu hình của dự án khác; vẫn xem dòng `config file` trong `--version` và hiểu cấu hình môi trường đang được nạp.

### 5.2. Viết playbook và đọc từng phần

Lưu `site.yml`:

```yaml
---
- name: Maintain a local course marker
  hosts: lab
  gather_facts: false
  become: false
  vars:
    lab_target_dir: "{{ playbook_dir }}/managed"
    course_message: "Managed by Ansible"
  tasks:
    - name: Ensure course directory has the desired mode
      ansible.builtin.file:
        path: "{{ lab_target_dir }}"
        state: directory
        mode: "0755"
    - name: Maintain course marker content
      ansible.builtin.copy:
        dest: "{{ lab_target_dir }}/status.txt"
        content: "{{ course_message }}\n"
        mode: "0644"
```

`playbook_dir` là thư mục của playbook, giúp đường đích không phụ thuộc thư mục làm việc của lệnh trên host. Nó chỉ phù hợp ví dụ local này; đường thư mục control không tự tồn tại trên máy remote. `state: directory` yêu cầu là thư mục; file module có thể tạo nếu thiếu. [Module file](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/file_module.html).

Các mode được viết trong dấu nháy để tránh YAML xử lý như số khác cơ số. **0755** nghĩa chủ sở hữu đọc/ghi/đi qua thư mục, group và người khác đọc/đi qua; **0644** nghĩa chủ đọc/ghi file, group/người khác đọc. Đây là file thông điệp không bí mật; secret cần quyền khác và cơ chế phù hợp. Không đặt owner/group root trong lab vì user đang quản lý file của mình.

### 5.3. Chạy và đối chiếu trạng thái thật

```bash
ansible-playbook -i inventory.ini site.yml --list-hosts
ansible-playbook -i inventory.ini site.yml --list-tasks
ansible-playbook -i inventory.ini site.yml --syntax-check
ansible-playbook -i inventory.ini site.yml --check --diff
# Check mode không được tạo status.txt trong playbook mẫu này.
test ! -e managed/status.txt
ansible-playbook -i inventory.ini site.yml
cat managed/status.txt
stat -c '%a %n' managed managed/status.txt
ansible-playbook -i inventory.ini site.yml
```

`-i` chọn inventory, tránh để công cụ dùng đích mặc định khác. `--list-hosts` phải chỉ có localhost. `test ! -e` kiểm tra file chưa tồn tại, mã 0 là đúng kỳ vọng; nó không in gì. Sau lần thật, `cat` in nội dung và `stat` in quyền/đường dẫn trên Linux GNU. Lần sau chỉ báo trạng thái hiện có.

Recap **minh họa** cho thư mục đã được chuẩn bị:

```text
Lần thật đầu: localhost : ok=2 changed=1 unreachable=0 failed=0
Lần thật sau: localhost : ok=2 changed=0 unreachable=0 failed=0
```

`ok` là số tác vụ thành công, trong đó changed có thể là tập con, không cộng hai cột thành tổng. `unreachable` là lỗi không thực hiện được kết nối/thực thi theo đường cần thiết; `failed` là tác vụ thất bại. Số cụ thể có thể đổi khi thêm task/facts hoặc thuộc tính thư mục chưa đúng. Nếu thấy cảnh báo tự khám phá Python interpreter, đọc đường interpreter đã chọn: đó không tự là failed, nhưng đường ấy phải phù hợp với module/Python bạn dùng. Với môi trường cần tái tạo, cố định interpreter theo tài liệu phiên bản và xác minh đường có thật trên host đích. Điểm cần kiểm chứng là failed/unreachable bằng 0, nội dung/quyền đúng và lần sau không tạo thay đổi khi đầu vào không đổi.

### 5.4. Tạo drift rồi kiểm tra công cụ sửa đúng

```bash
printf 'Changed manually\n' > managed/status.txt
ansible-playbook -i inventory.ini site.yml --check --diff
cat managed/status.txt
ansible-playbook -i inventory.ini site.yml
cat managed/status.txt
ansible-playbook -i inventory.ini site.yml
```

Sau check, `cat` vẫn phải là `Changed manually`: công cụ chỉ dự báo. Sau lần thật, `Managed by Ansible` xuất hiện trở lại; lần tiếp kỳ vọng changed=0. Nếu sửa file bằng tay là yêu cầu hợp lệ lâu dài, hãy cập nhật desired state, không để con người và automation liên tục ghi đè nhau.

Thử đổi `course_message` trong playbook rồi chạy để thấy một thay đổi có chủ đích. Giữ bản trước và sau để so. Không xem `changed=0` như mục tiêu tuyệt đối: đổi cấu hình mong muốn đúng phải có thay đổi đúng.

## 6. Handler giúp tránh restart thừa ra sao?

**Handler — tác vụ phản ứng khi được thông báo** thường dùng nạp lại/khởi động lại sau đổi cấu hình. **Notify — gửi thông báo nội bộ trong lượt Ansible** ở đây không gửi email/chat; task báo changed kích hoạt handler tương ứng. Nhiều task thông báo cùng một handler thường chỉ làm handler chạy một lần tại điểm xử lý thông báo, mặc định ở cuối phần play phù hợp. [Handlers](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_handlers.html).

Với dịch vụ bài 15, **systemd** là bộ quản lý dịch vụ; **unit** là mô tả đối tượng như service. **Daemon reload — yêu cầu systemd đọc lại unit** khác **service restart — dừng/chạy lại ứng dụng**. Đổi file unit rồi chỉ restart có thể chưa cập nhật hiểu biết của manager; đổi file cấu hình ứng dụng không luôn cần daemon reload.

Mô hình triển khai trên clone, không là playbook phải chạy trong lab này:

```text
Task tạo user/thư mục đúng quyền
              ↓
Task template file cấu hình + kiểm tra hợp lệ
              ↓ nếu changed
Task template unit → notify đọc lại unit
              ↓ nếu changed
Handler đọc lại unit trước → handler restart khi cần
              ↓
Health check qua giao diện dịch vụ
```

Thứ tự handler phụ thuộc thứ tự định nghĩa, không chỉ thứ tự tên trong notify. Đảm bảo đọc lại unit trước restart và giữ service started/enabled riêng theo yêu cầu. `state: restarted` chạy vô điều kiện mỗi lần làm gián đoạn không cần thiết; `state: started` thường bảo đảm chạy mà không ép restart nếu đã chạy. Nếu task sau failed, handler được thông báo có thể không chạy theo mặc định; `force_handlers` và xử lý lỗi phải được thiết kế, không bật máy móc.

Để thấy cú pháp mà không restart dịch vụ thật, trong `site.yml` của lab hãy thêm `notify` ở cùng mức với `ansible.builtin.copy`, rồi thêm `handlers` ở cùng mức với `tasks`:

```yaml
    - name: Maintain course marker content
      ansible.builtin.copy:
        dest: "{{ lab_target_dir }}/status.txt"
        content: "{{ course_message }}\n"
        mode: "0644"
      notify: Report marker update
  handlers:
    - name: Report marker update
      ansible.builtin.debug:
        msg: "The marker changed; a real service handler would react here."
```

Đây là phần thay task copy và bổ sung handler, không là playbook độc lập. Đổi `course_message` rồi chạy thật: task copy changed và có dòng `RUNNING HANDLER` in thông điệp. Chạy lại khi file đúng: không có thông báo mới nên không có handler này. `debug` chỉ in thông điệp, không restart dịch vụ hay gửi tin ra ngoài. Thử đó xác nhận đường notify→handler, chưa xác nhận một handler systemd thật có thứ tự/phục hồi đúng.

**Template validate — kiểm tra file khuôn đã tạo trước khi thay file đích** hỗ trợ nhiều công cụ cấu hình qua tham số validate của module. Cú pháp kiểm tra đúng ứng dụng và quyền phải được thử; không coi YAML hợp lệ là unit/ứng dụng hợp lệ. [Module template](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/template_module.html).

## 7. Từ một host đến nhiều host: điều gì phải thêm?

**Provisioning — cấp hạ tầng ban đầu** tạo máy, mạng, ổ lưu trữ. Configuration management cấu hình hệ điều hành/dịch vụ trên đích có sẵn. Một công cụ có thể hỗ trợ cả hai nhưng trách nhiệm và đường phục hồi khác nhau.

Với remote host, inventory ghi địa chỉ, user SSH và cách chọn khóa. **Host key — khóa nhận diện server** phải được xác minh; **user key — khóa của người đăng nhập** phải được server chấp nhận. Kiểm tra một kết nối thủ công theo bài 27 trước, không tắt host key checking toàn cục để tránh lỗi thiết lập.

**Git** giữ lịch sử desired state; **commit** là mốc thay đổi có thể xem lại. Không commit secret hoặc danh sách host nhạy cảm ngoài phạm vi cho phép. **Ansible Vault — cơ chế mã hóa dữ liệu Ansible** bảo vệ dữ liệu khi lưu nếu quản lý khóa đúng, không ngăn dữ liệu hiện ra sau giải mã qua debug/diff hoặc bị người có quyền đích đọc.

Quy trình nên có những chốt cụ thể:

1. Review diff và host đích; kiểm tra cú pháp/dự báo phù hợp.
2. Áp dụng một host thử hoặc một nhóm nhỏ; **canary — đích thử trước** giúp phát hiện ảnh hưởng trước mở rộng.
3. Kiểm tra chức năng, log và trạng thái người dùng nhìn thấy, không chỉ recap.
4. Mở rộng theo **batch — nhóm nhỏ mỗi lượt** với `serial` phù hợp; dùng `--limit` để giới hạn host. Batch giảm phạm vi cùng lúc, không tự hoàn tác host đã đổi.
5. Nếu cần quay lại, lấy phiên bản cấu hình đã biết tốt và áp dụng có kiểm chứng. **Rollback — phục hồi trạng thái trước** không tự xảy ra do playbook failed.

**Pin version — cố định phiên bản theo yêu cầu** giúp tái tạo công cụ/gói/cấu hình. `state: latest` phụ thuộc kho hiện tại nên kết quả có thể khác hôm sau; `present` không tự khóa phiên bản. Nếu cần vá mới, phải cập nhật version theo quy trình, không giữ cũ vô thời hạn vì muốn tái tạo.

Rollback cấu hình không tự đảo migration dữ liệu; **migration — đổi cấu trúc/nội dung dữ liệu** cần kế hoạch riêng ở bài 30. Giữ bằng chứng công cụ/bản module đã chạy để biết nguyên nhân khi hành vi đổi theo phiên bản.

## 8. Lỗi thường gặp và cách đọc lại

| Hiện tượng | Kiểm tra đầu tiên |
|---|---|
| Chạy localhost mà sửa hệ thật | Local không cách ly; xem đường đích, become và module |
| Host ngoài ý định xuất hiện | Xem inventory, pattern và `--list-hosts`, dùng limit phù hợp |
| YAML báo lỗi thụt dòng | Dùng dấu cách nhất quán, không dùng tab; đọc dòng lỗi và dòng trước |
| Check báo lỗi parent chưa có | Thay đổi dự báo trước chưa tạo thật; thiết kế điều kiện/chuẩn bị lab, không ép tác vụ thật để giấu lỗi |
| Lần sau luôn changed | Xem lệnh nối thêm, timestamp biến đổi, mode/owner hoặc restart vô điều kiện |
| Changed=0 nhưng file sai | Kiểm tra đúng host/đường, đầu vào biến và changed_when có che thay đổi không |
| Service lỗi dù recap thành công | Kiểm tra cấu hình ứng dụng, handler, health và log |
| Diff lộ mật khẩu | Dừng thu/chia sẻ đầu ra, xử lý secret đã lộ theo bài 27 và đổi cách quản lý |

## 9. Tự kiểm tra và hồ sơ nộp

1. Chạy cùng mô tả hai lần, lần sau changed=0 có đủ chứng minh mọi thứ ổn? **Đối chiếu:** phải kiểm tra nội dung/quyền và chức năng; recap không là health check.
2. Check mode có bảo đảm không có tác vụ thật? **Đối chiếu:** không với tác vụ `check_mode: false` hoặc hành vi tùy biến; cần đọc playbook và module.
3. Vì sao `shell: echo X >> file` dễ không idempotent? **Đối chiếu:** nối một dòng mỗi lần; copy/template quản lý nội dung cuối.
4. Hai task notify cùng handler có buộc restart hai lần? **Đối chiếu:** thường handler được gộp mỗi điểm xử lý, cần hiểu thứ tự/thời điểm chạy.
5. Dùng Git revert có tự phục hồi dữ liệu dịch vụ không? **Đối chiếu:** không; chỉ đổi mô tả, còn phải áp dụng và xử lý dữ liệu nếu đã thay.
6. Local connection có đủ an toàn để thử một playbook root chưa đọc? **Đối chiếu:** không; nó chạy ngay trên máy điều khiển.

Nộp inventory/playbook, host đích, phiên bản Ansible, kết quả hai lần thật, file/quyền thực tế và thử drift. Kèm một kế hoạch rollback có tiêu chí chức năng; nếu công cụ chưa cài, ghi rõ chỉ đã kiểm tra YAML chứ chưa chứng minh idempotency bằng Ansible.

**Tự nhắc lại:** inventory chọn đích; play chọn việc; module đưa trạng thái về desired state; biến/template giữ dữ liệu cấu hình; handler phản ứng khi cần. Kiểm chứng bằng lần chạy lại, drift và hành vi thật. Bài 29 bổ sung cách nhìn dịch vụ khỏe qua log, metric và trace.

## Nguồn đối chiếu

- [Playbook](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_intro.html), [check/diff mode](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html), [handlers](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_handlers.html), [become](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_privilege_escalation.html).
- [file](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/file_module.html), [copy](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/copy_module.html), [template](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/template_module.html): đối chiếu hỗ trợ check/diff và tham số theo bản cài qua `ansible-doc`.
