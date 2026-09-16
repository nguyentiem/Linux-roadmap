# Bài 28 — Tự động hóa cấu hình với Ansible

[Mục lục](../README.md) · [← Bài 27](27-hardening-va-ban-va.md) · [Bài 29 →](29-observability.md)

## Mục tiêu

Cần bài 13, 15, 27. Viết desired state và chứng minh lần chạy sau không tạo thay đổi vô nghĩa. Cần Ansible trên control machine; lab đầu dùng localhost trong VM.

## 1. Mô hình thực thi

Inventory xác định host; play gắn nhóm host với task; module thực hiện hành động; variable/template tham số hóa cấu hình. Handler thường chỉ chạy khi task báo changed, phù hợp cho restart sau thay đổi cấu hình. Dùng tên module đầy đủ để rõ collection.

Idempotency nghĩa là áp dụng lại cùng trạng thái mong muốn không tiếp tục làm thay đổi trạng thái. Module chuyên dụng thường dễ đạt hơn một chuỗi shell. Tuy nhiên không phải module/playbook nào cũng tự idempotent. Check mode chỉ là dự báo theo hỗ trợ module, không thay phép thử thật. [Ansible playbooks](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_intro.html)

## 2. Lab: quản lý một file trạng thái

Tạo thư mục `~/linux-lab/ansible`. Lưu `inventory.ini`:

```ini
[lab]
localhost ansible_connection=local
```

Lưu `site.yml`:

```yaml
---
- name: Configure Linux course directory
  hosts: lab
  become: true
  vars:
    course_message: "Managed by Ansible"
  tasks:
    - name: Ensure course directory exists
      ansible.builtin.file:
        path: /srv/linux-ansible-lab
        state: directory
        owner: root
        group: root
        mode: "0755"
    - name: Write course marker
      ansible.builtin.copy:
        dest: /srv/linux-ansible-lab/status.txt
        content: "{{ course_message }}\n"
        owner: root
        group: root
        mode: "0644"
```

```bash
ansible-playbook -i inventory.ini site.yml --syntax-check
ansible-playbook -i inventory.ini site.yml --check --diff --ask-become-pass
ansible-playbook -i inventory.ini site.yml --ask-become-pass
ansible-playbook -i inventory.ini site.yml --ask-become-pass
```

Lần thật đầu có thể changed; lần thứ hai kỳ vọng changed=0. Thay nội dung file thủ công, chạy lại và kiểm chứng drift được sửa. `--diff` có thể lộ nội dung nhạy cảm, chỉ dùng phù hợp với dữ liệu.

## 3. Mở rộng sang service bài 15

Tách template unit, task user/directory/file và handler daemon-reload/restart. Task thay unit cần thông báo handler; task giữ service enabled/started không nên restart vô điều kiện mỗi lần chạy. Pin cấu hình/package theo yêu cầu thay vì luôn yêu cầu latest nếu muốn kết quả tái tạo.

Với host từ xa, inventory ghi địa chỉ thực, user SSH và key do bạn quản lý. Kiểm tra SSH thủ công và host key trước. Không tắt host key checking toàn cục để xử lý môi trường chưa thiết lập.

## 4. Git và quy trình thay đổi

Commit desired state, không commit secret hoặc inventory nhạy cảm ngoài phạm vi cho phép. Review diff, thử trên một host, kiểm tra health, rồi mới mở rộng. Với nhiều host, batching giới hạn ảnh hưởng, nhưng vẫn cần rollback khi ứng dụng không tương thích.

Provisioning tạo VM/network/storage; configuration management đưa hệ điều hành và service về trạng thái mong muốn. Hai lớp liên quan nhưng không cùng trách nhiệm.

## 5. Kiểm tra đạt

Nộp playbook, output hai lần chạy và thử drift. Giải thích vì sao `shell: echo ... >> file` tạo thêm dòng mỗi lần chạy, và cách thay bằng module copy/template. Viết kế hoạch rollback version cấu hình trong Git.

## Đọc thêm

Tra `ansible-doc ansible.builtin.file`, `ansible-doc ansible.builtin.copy`; [Ansible documentation](https://docs.ansible.com/).
