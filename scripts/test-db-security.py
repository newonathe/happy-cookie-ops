"""MP-06.l SQL-role, active-profile and containment tests on owned local fixtures."""
import hashlib
import importlib.util
import json
import re
import runpy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify_functions = runpy.run_path(str(ROOT / 'scripts/verify-function-authority.py'))['verify_functions']
# B1: each customer rule is one tagged line (`if ... then -- rule:name`) in the migration; the suite
# neutralises exactly that line, or applies one text substitution, inside the one function it names, and
# the refusal case must then fail. Expected text is the failing operation of the suite, in suite order.
ORDER_MIGRATIONS = [ROOT / 'supabase/migrations/20260101003500_place_order.sql',
                    ROOT / 'supabase/migrations/20260101003600_order_lookup.sql',
                    ROOT / 'supabase/migrations/20260101003700_staff_orders.sql',
                    ROOT / 'supabase/migrations/20260101003800_shop_status.sql',
                    ROOT / 'supabase/migrations/20260101003900_staff_orders_review.sql',
                    ROOT / 'supabase/migrations/20260101004000_order_extras.sql',
                    ROOT / 'supabase/migrations/20260101004100_scheduled_events.sql',
                    ROOT / 'supabase/migrations/20260101004200_scheduled_event_rent.sql',
                    ROOT / 'supabase/migrations/20260101004300_stock_catalogue.sql',
                    ROOT / 'supabase/migrations/20260101004400_recipes.sql',
                    ROOT / 'supabase/migrations/20260101004500_stock_unit_guard.sql',
                    ROOT / 'supabase/migrations/20260101004600_stock_ledger.sql']
_OUT = 'order outcome differs: anon / '
_CHK = 'order check differs: anon / '
_LOOK = 'lookup check differs: anon / '
ORDER_MUTATIONS = {
    'rule_keys_required': ('place_order', 'rule', 'keys-required', _OUT + 'place_missing_field / '),
    'rule_keys_unknown': ('place_order', 'rule', 'keys-unknown', _OUT + 'place_unknown_price / '),
    'rule_replay': ('place_order', 'rule', 'replay', _OUT + 'place_replay_same_body / '),
    'rule_client_id_reuse': ('place_order', 'rule', 'client-id-reuse', _OUT + 'place_replay_other_body / '),
    'rule_window': ('place_order', 'rule', 'window', _OUT + 'place_closed_window / '),
    'rule_method': ('place_order', 'rule', 'method', _OUT + 'place_method_unknown / '),
    'rule_pickup_day': ('place_order', 'rule', 'pickup-day', _OUT + 'place_pickup_tuesday / '),
    'rule_pickup_lead': ('place_order', 'rule', 'pickup-lead', _OUT + 'place_pickup_too_far / '),
    'rule_pickup_time': ('place_order', 'rule', 'pickup-time', _OUT + 'place_time_before_open / '),
    'rule_menu': ('place_order', 'rule', 'menu', _OUT + 'place_item_unpublished / '),
    'rule_max_per_order': ('place_order', 'rule', 'max-per-order', _OUT + 'place_over_max / '),
    'rule_phone_limit': ('place_order', 'rule', 'phone-limit', _OUT + 'place_phone_limit / '),
    'rule_capacity': ('place_order', 'rule', 'capacity', _OUT + 'place_capacity_full / '),
    'rule_waitlist_date': ('join_waitlist', 'rule', 'waitlist-date', _OUT + 'wait_date_past / '),
    'rule_waitlist_client_id_reuse': ('join_waitlist', 'rule', 'waitlist-client-id-reuse', _OUT + 'wait_replay_other_body / '),
    'rule_waitlist_replay': ('join_waitlist', 'rule', 'waitlist-replay', _OUT + 'wait_replay_other_body / '),
    'rule_waitlist_dedupe': ('join_waitlist', 'rule', 'waitlist-dedupe', 'duplicate key value violates unique constraint'),
    'rule_waitlist_limit': ('join_waitlist', 'rule', 'waitlist-limit', _OUT + 'wait_limit / '),
    'text_menu_published': ('place_order', 'text',
                            ('join public.products p on p.id = t.pid and p.published and p.active;',
                             'join public.products p on p.id = t.pid and p.active;'), _OUT + 'place_item_unpublished / '),
    'text_menu_active': ('place_order', 'text',
                         ('join public.products p on p.id = t.pid and p.published and p.active;',
                          'join public.products p on p.id = t.pid and p.published;'), _OUT + 'place_item_inactive / '),
    'text_method_active': ('place_order', 'text',
                           ('where m.active and m.label = v_method', 'where m.label = v_method'), _OUT + 'place_method_inactive / '),
    'text_weight_committed': ('place_order', 'text',
                              ('sum(oi.qty * oi.capacity_weight)', 'sum(oi.qty)'), _OUT + 'place_capacity_full / '),
    'text_weight_requested': ('place_order', 'text',
                              ('coalesce(sum(t.qty * p.capacity_weight), 0)', 'coalesce(sum(t.qty), 0)'), _OUT + 'cap_fries_too_heavy / '),
    'text_hold_expiry': ('order_holds_capacity', 'text',
                         ('then p_now < p_placed_at + make_interval(hours => greatest(0, p_hold_hours))', 'then true'),
                         _OUT + 'place_phone_after_expiry / '),
    'text_hold_refunded': ('order_holds_capacity', 'text',
                           ("when p_pay = 'refunded' then false", "when false then false"), _OUT + 'cap_refund_and_cancel_release / '),
    'text_hold_cancelled': ('order_holds_capacity', 'text',
                            ("when p_state in ('Cancelled', 'No-show') then false", "when false then false"),
                            _OUT + 'cap_refund_and_cancel_release / '),
    'text_status_leaks_phone': ('order_status', 'text',
                                ("'order_no', o.id, 'state'", "'order_no', o.id, 'phone', o.phone, 'state'"),
                                _CHK + 'status_keys_exact'),
    'text_erase_keeps_token': ('anonymise_customer', 'text',
                               ("ig = '',\n           status_token = null,\n", "ig = '',\n"),
                               'erased paid order kept personal data'),
    'text_erase_keeps_waitlist': ('anonymise_customer', 'text',
                                  ('delete from waitlist_entries where phone = v_norm;', 'null;'),
                                  'erased number kept waitlist entries'),
    'text_prune_keeps_handle': ('prune_personal_data', 'text',
                                ("ig = '',\n           status_token = null,\n", 'status_token = null,\n'), 'prune kept personal data'),
    'text_prune_keeps_waitlist': ('prune_personal_data', 'text',
                                  ('delete from waitlist_entries where created_at < now() - make_interval(days => p_retain_days);', 'null;'),
                                  'prune kept personal data'),
}
LOOKUP_MUTATIONS = {
    'rule_find_throttle': ('find_order', 'rule', 'find-throttle', _LOOK + 'find_locked_after_ten'),
    'rule_find_phone': ('find_order', 'rule', 'find-phone', _LOOK + 'find_wrong_phone'),
    'text_find_plus63': ('find_order', 'text',
                         ("  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;\n", ''),
                         _LOOK + 'find_plus63'),
    'text_find_ten_digit': ('find_order', 'text',
                            ("  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;\n", ''),
                            _LOOK + 'find_ten_digit'),
    'text_rules_leak_limits': ('get_shop_order_rules', 'text',
                               ("'unpaid_hold_hours', r.unpaid_hold_hours)", "'unpaid_hold_hours', r.unpaid_hold_hours, 'max_unpaid_per_phone', r.max_unpaid_per_phone)"),
                               _LOOK + 'rules_keys_are_the_customer_ones'),
}
_STF = 'staff outcome differs: active_owner / '
STAFF_MUTATIONS = {
    'rule_confirm_replay': ('staff_confirm_payment', 'rule', 'confirm-replay', _STF + 'confirm_replay / '),
    'rule_confirm_stale': ('staff_confirm_payment', 'rule', 'stale', _STF + 'confirm_stale / '),
    'rule_confirm_state': ('staff_confirm_payment', 'rule', 'confirm-state', _STF + 'confirm_cancelled / '),
    'rule_confirm_capacity': ('staff_confirm_payment', 'rule', 'confirm-capacity', _STF + 'confirm_lapsed_over_capacity / '),
    'rule_reject_replay': ('staff_reject_payment', 'rule', 'reject-replay', _STF + 'reject_replay / '),
    'rule_reject_stale': ('staff_reject_payment', 'rule', 'stale', _STF + 'reject_stale / '),
    'rule_reject_state': ('staff_reject_payment', 'rule', 'reject-state', _STF + 'reject_paid_order / '),
    'rule_reopen_replay': ('staff_reopen_order', 'rule', 'reopen-replay', _STF + 'reopen_replay / '),
    'rule_reopen_stale': ('staff_reopen_order', 'rule', 'stale', _STF + 'reopen_stale / '),
    'rule_reopen_state': ('staff_reopen_order', 'rule', 'reopen-state', _STF + 'reopen_paid_order / '),
    'rule_status_replay': ('staff_set_status', 'rule', 'status-replay', _STF + 'status_replay / '),
    'rule_status_stale': ('staff_set_status', 'rule', 'stale', _STF + 'status_stale / '),
    'rule_status_transition': ('staff_set_status', 'rule', 'status-transition', _STF + 'status_illegal / '),
    'rule_pack_flagged': ('staff_set_status', 'rule', 'pack-flagged', _STF + 'pack_flagged / '),
    'rule_flag_item': ('staff_flag_item', 'rule', 'flag-item', _STF + 'flag_missing_item / '),
    'rule_flag_replay': ('staff_flag_item', 'rule', 'flag-replay', _STF + 'flag_replay / '),
    'rule_flag_stale': ('staff_flag_item', 'rule', 'stale', _STF + 'flag_stale / '),
    'rule_flag_state': ('staff_flag_item', 'rule', 'flag-state', _STF + 'flag_finished / '),
    'rule_swap_client_id_reuse': ('staff_swap_item', 'rule', 'swap-client-id-reuse', _STF + 'swap_client_id_reuse / '),
    'rule_swap_stale': ('staff_swap_item', 'rule', 'stale', _STF + 'swap_stale / '),
    'rule_swap_state': ('staff_swap_item', 'rule', 'swap-state', _STF + 'swap_finished / '),
    'rule_swap_same': ('staff_swap_item', 'rule', 'swap-same', _STF + 'swap_same / '),
    'rule_swap_item': ('staff_swap_item', 'rule', 'swap-item', _STF + 'swap_missing_item / '),
    'rule_swap_menu': ('staff_swap_item', 'rule', 'swap-menu', _STF + 'swap_menu / '),
    'rule_swap_price_clash': ('staff_swap_item', 'rule', 'swap-price-clash', _STF + 'swap_price_clash / '),
    'rule_swap_capacity': ('staff_swap_item', 'rule', 'swap-capacity', _STF + 'swap_capacity / '),
    'rule_refund_replay': ('staff_refund', 'rule', 'refund-replay', _STF + 'refund_replay / '),
    'rule_refund_stale': ('staff_refund', 'rule', 'stale', _STF + 'refund_stale / '),
    'rule_refund_paid': ('staff_refund', 'rule', 'refund-paid', _STF + 'refund_unpaid / '),
    'rule_settle_replay': ('staff_settle_balance', 'rule', 'settle-replay', _STF + 'settle_replay / '),
    'rule_settle_stale': ('staff_settle_balance', 'rule', 'stale', _STF + 'settle_stale / '),
    'rule_settle_paid': ('staff_settle_balance', 'rule', 'settle-paid', _STF + 'settle_unpaid / '),
}
_SHP = 'shop state outcome differs: '
SHOP_MUTATIONS = {
    'rule_override_closed': ('place_order', 'rule', 'override-closed', _SHP + 'anon / place_while_closed / '),
    'rule_override_soldout': ('place_order', 'rule', 'override-soldout', _SHP + 'anon / place_while_soldout / '),
    'rule_override_mode': ('set_shop_override', 'rule', 'override-mode', _SHP + 'active_owner / override_bad_mode / '),
    'text_override_open_skips_window': ('place_order', 'text',
                                        (" and v_override is distinct from 'open' and v_override is distinct from 'soon' then -- rule:window", " then -- rule:window"),
                                        _SHP + 'anon / place_open_outside_window / '),
    'text_status_leaks_capacity': ('get_shop_status', 'text',
                                   ("'override',  (select s.override from public.shop_state s where s.id))",
                                    "'override',  (select s.override from public.shop_state s where s.id), 'capacity', 200)"),
                                   'shop state check differs: anon / shop_status_keys_exact'),
}
STAFF_MUTATIONS |= {
    'rule_reopen_capacity': ('staff_reopen_order', 'rule', 'reopen-capacity', _STF + 'reopen_over_capacity / '),
    'rule_reopen_phone_limit': ('staff_reopen_order', 'rule', 'reopen-phone-limit', _STF + 'reopen_phone_limit / '),
    'text_swap_keeps_surcharge': ('staff_swap_item', 'text', ('o.total_cents + (v_new_total - v_old_total)', 'v_new_total'),
                                  'staff check differs: active_owner / swap_keeps_the_surcharge'),
    'text_swap_weight_clash': ('staff_swap_item', 'text', (' or i.capacity_weight <> v_to.capacity_weight)', ')'),
                               _STF + 'swap_weight_clash / '),
}
STAFF_TABLE_MUTATIONS = {
    'orders_update_grant': ('grant update on public.orders to authenticated;', 'staff outcome differs: active_helper / orders_table_update / '),
}
STAFF_ACL = ('get_staff_orders()', 'staff_confirm_payment(text,timestamptz,boolean)', 'staff_reject_payment(text,timestamptz)',
             'staff_reopen_order(text,timestamptz)', 'staff_set_status(text,public.order_state,timestamptz)',
             'staff_flag_item(text,text,boolean,timestamptz)', 'staff_swap_item(text,text,text,uuid,timestamptz)',
             'staff_refund(text,text,timestamptz)', 'staff_settle_balance(text,timestamptz)')
ORDER_TABLE_MUTATIONS = {
    'orders_rows_leak': ('alter policy "orders staff read" on public.orders using (true);', _CHK + 'orders_rows_hidden'),
    'waitlist_table_select': ('grant select on public.waitlist_entries to anon;', _OUT + 'waitlist_table_select / '),
    'rules_table_select': ('grant select on public.order_rules to anon;', _OUT + 'rules_table_select / '),
}


# B4a: boxes, add-ons, the sampler cap and the same-day surcharge (order-extras.sql). The migration is the
# last one in ORDER_MIGRATIONS that defines each function, so these act on its definitions.
_EXO = 'extras outcome differs: anon / '
_EXC = 'extras check differs: anon / '
EXTRAS_MUTATIONS = {
    'rule_same_day_off': ('place_order', 'rule', 'same-day-off', _EXO + 'place_same_day_off / '),
    'rule_same_day_time': ('place_order', 'rule', 'same-day-time', _EXO + 'place_same_day_past_time / '),
    'rule_sampler_cap': ('place_order', 'rule', 'sampler-cap', _EXO + 'place_sampler_cap / '),
    'rule_box_size': ('place_order', 'rule', 'box-size', _EXO + 'place_box_size_unknown / '),
    'rule_box_fit': ('place_order', 'rule', 'box-fit', _EXO + 'place_box_fit / '),
    'rule_addon_dup': ('place_order', 'rule', 'addon-dup', _EXO + 'place_addon_dup / '),
    'rule_addon_unknown': ('place_order', 'rule', 'addon-unknown', _EXO + 'place_addon_unknown / '),
    'rule_addon_variant': ('place_order', 'rule', 'addon-variant', _EXO + 'place_addon_variant_missing / '),
    'rule_addon_text': ('place_order', 'rule', 'addon-text', _EXO + 'place_addon_text_missing / '),
    'rule_addon_qty': ('place_order', 'rule', 'addon-qty', _EXO + 'place_addon_qty / '),
    'text_total_omits_boxes': ('place_order', 'text',
                               ('v_total := v_total + v_addon_total + v_box_total + v_surcharge;',
                                'v_total := v_total + v_addon_total + v_surcharge;'), _EXC + 'box_total'),
    'text_total_omits_addons': ('place_order', 'text',
                                ('v_total := v_total + v_addon_total + v_box_total + v_surcharge;',
                                 'v_total := v_total + v_box_total + v_surcharge;'), _EXC + 'addons_total'),
    'text_surcharge_base': ('place_order', 'text',
                            ('v_base := v_total + case when v_extras.same_day_on_extras then v_addon_total + v_box_total else 0 end;',
                             'v_base := v_total;'), _EXC + 'same_day_on_extras_total'),
    'text_surcharge_rounding': ('place_order', 'text',
                                ('(v_base * v_extras.same_day_percent + 50) / 100', '(v_base * v_extras.same_day_percent) / 100'),
                                _EXC + 'same_day_rounding'),
    'text_addon_qty_per_line': ('place_order', 'text',
                                ("select coalesce(sum(t.q), 0) into v_ao_total from unnest(v_ao_ids, v_ao_qtys) as t(id, q) where t.id = v_ao_ids[v_i];",
                                 "v_ao_total := v_ao_qtys[v_i];"), _EXO + 'place_addon_qty_across_lines / '),
    'text_same_day_campus_start': ('place_order', 'text',
                                   ("then substr(v_rules.campus_from, 1, 2)::integer * 60 + substr(v_rules.campus_from, 4, 2)::integer",
                                    'then 1440'), _EXO + 'place_same_day_campus_past / '),
    'text_status_leaks_note': ('order_status', 'text', ("'variant', a.variant)", "'variant', a.variant, 'note', a.note)"),
                               _EXC + 'status_hides_note'),
    'text_erase_keeps_note': ('anonymise_customer', 'text',
                              ("update order_add_ons a set note = null\n    from orders o\n   where a.order_id = o.id and regexp_replace(o.phone, '\\D', '', 'g') = v_norm and a.note is not null;",
                               'null;'), 'extras check differs: erased paid order kept the note'),
    'text_prune_keeps_note': ('prune_personal_data', 'text',
                              ("update order_add_ons a set note = null\n    from orders o\n   where a.order_id = o.id and o.placed_at < now() - make_interval(days => p_retain_days)\n     and o.phone <> '' and a.note is not null;",
                               'null;'), 'extras check differs: prune kept the note'),
}
EXTRAS_TABLE_MUTATIONS = {
    'extras_table_select': ('grant select on public.order_extras to anon;', _EXO + 'extras_table_select / '),
    'add_ons_table_select': ('grant select on public.order_add_ons to anon;', _EXO + 'add_ons_table_select / '),
    'boxes_table_select': ('grant select on public.order_boxes to anon;', _EXO + 'boxes_table_select / '),
}

# D4: the owner's scheduled bazaar events (scheduled-events.sql), acting on the last migration that defines each function.
_SC = 'scheduled outcome differs: active_owner / '
SCHEDULED_MUTATIONS = {
    'rule_sched_keys': ('save_scheduled_event', 'rule', 'keys', _SC + 'save_keys_missing / '),
    'rule_sched_text': ('save_scheduled_event', 'rule', 'text', _SC + 'save_name_blank / '),
    'rule_sched_dates': ('save_scheduled_event', 'rule', 'dates', _SC + 'save_ends_before_start / '),
    'rule_sched_rent': ('save_scheduled_event', 'rule', 'rent', _SC + 'save_rent_negative / '),
    'rule_sched_create_stamp': ('save_scheduled_event', 'rule', 'create-stamp', _SC + 'create_with_stamp_unknown / '),
    'rule_sched_replay': ('save_scheduled_event', 'rule', 'replay', _SC + 'create_replay / '),
    'rule_sched_stale': ('save_scheduled_event', 'rule', 'stale', _SC + 'change_stale / '),
    'rule_sched_link_missing': ('link_scheduled_event', 'rule', 'link-missing', _SC + 'link_booking_missing / '),
    'rule_sched_link_event': ('link_scheduled_event', 'rule', 'link-event', _SC + 'link_event_missing / '),
    'rule_sched_link_conflict': ('link_scheduled_event', 'rule', 'link-conflict', _SC + 'link_other_event / '),
    'rule_sched_link_inactive': ('link_scheduled_event', 'rule', 'link-inactive', _SC + 'link_inactive / '),
    'rule_sched_link_rent': ('link_scheduled_event', 'rule', 'link-rent', 'scheduled check differs: active_owner / link_books_rent'),
}
SCHEDULED_TABLE_MUTATIONS = {
    'scheduled_table_select': ('grant select on public.scheduled_events to anon;',
                               'scheduled outcome differs: anon / scheduled_table_select / '),
    'scheduled_event_unique': ('drop index public.scheduled_events_event_uq;',
                               'scheduled outcome differs: active_owner / link_event_taken / '),
}

# A3: the owner's stock catalogue (stock-catalogue.sql), acting on the last migration that defines each function.
_ST = 'stock outcome differs: active_owner / '
_STC = 'stock check differs: active_owner / '
STOCK_MUTATIONS = {
    'rule_supplier_keys': ('save_supplier', 'rule', 'supplier-keys', _ST + 'sup_keys_missing / '),
    'rule_supplier_id': ('save_supplier', 'rule', 'supplier-id', _ST + 'sup_id_bad / '),
    'rule_supplier_text': ('save_supplier', 'rule', 'supplier-text', _ST + 'sup_name_blank / '),
    'rule_supplier_name_taken': ('save_supplier', 'rule', 'supplier-name-taken', _ST + 'sup_name_taken / '),
    'rule_supplier_create_stamp': ('save_supplier', 'rule', 'supplier-create-stamp', _ST + 'sup_create_with_stamp_unknown / '),
    'rule_supplier_replay': ('save_supplier', 'rule', 'supplier-replay', _ST + 'sup_create_replay / '),
    'rule_supplier_stale': ('save_supplier', 'rule', 'supplier-stale', _ST + 'sup_change_stale / '),
    'rule_item_keys': ('save_stock_item', 'rule', 'item-keys', _ST + 'item_keys_missing / '),
    'rule_item_id': ('save_stock_item', 'rule', 'item-id', _ST + 'item_id_bad / '),
    'rule_item_text': ('save_stock_item', 'rule', 'item-text', _ST + 'item_name_blank / '),
    'rule_item_category': ('save_stock_item', 'rule', 'item-category', _ST + 'item_category_bad / '),
    'rule_item_numbers': ('save_stock_item', 'rule', 'item-numbers', _ST + 'item_par_negative / '),
    'rule_item_useby': ('save_stock_item', 'rule', 'item-useby', _ST + 'item_useby_zero / '),
    'rule_item_supplier': ('save_stock_item', 'rule', 'item-supplier', _ST + 'item_supplier_unknown / '),
    'rule_item_name_taken': ('save_stock_item', 'rule', 'item-name-taken', _ST + 'item_name_taken / '),
    'rule_item_create_stamp': ('save_stock_item', 'rule', 'item-create-stamp', _ST + 'item_create_with_stamp_unknown / '),
    'rule_item_replay': ('save_stock_item', 'rule', 'item-replay', _ST + 'item_create_replay / '),
    'rule_item_stale': ('save_stock_item', 'rule', 'item-stale', _ST + 'item_change_stale / '),
    'rule_item_rename_referenced': ('save_stock_item', 'rule', 'item-rename-referenced', _ST + 'item_rename_referenced / '),
    'rule_item_unit_referenced': ('save_stock_item', 'rule', 'item-unit-referenced', _ST + 'item_unit_change_referenced / '),
    'rule_price_keys': ('save_supplier_price', 'rule', 'price-keys', _ST + 'price_keys_missing / '),
    'rule_price_text': ('save_supplier_price', 'rule', 'price-text', _ST + 'price_label_blank / '),
    'rule_price_cents': ('save_supplier_price', 'rule', 'price-cents', _ST + 'price_cents_negative / '),
    'rule_price_supplier': ('save_supplier_price', 'rule', 'price-supplier', _ST + 'price_supplier_unknown / '),
    'rule_price_item': ('save_supplier_price', 'rule', 'price-item', _ST + 'price_item_unknown / '),
    'rule_price_duplicate': ('save_supplier_price', 'rule', 'price-duplicate', _ST + 'price_duplicate / '),
    'rule_price_create_stamp': ('save_supplier_price', 'rule', 'price-create-stamp', _ST + 'price_create_with_stamp_unknown / '),
    'rule_price_replay': ('save_supplier_price', 'rule', 'price-replay', _ST + 'price_create_replay / '),
    'rule_price_history': ('save_supplier_price', 'rule', 'price-history', _STC + 'price_history_pushed'),
    'rule_price_stale': ('save_supplier_price', 'rule', 'price-stale', _ST + 'price_change_stale / '),
}
STOCK_TABLE_MUTATIONS = {
    'stock_table_update': ('grant update on public.suppliers to anon;',
                           'stock outcome differs: anon / stock_suppliers_update / '),
}

# A4: the owner's recipes with versions (recipes.sql), acting on the last migration that defines each function.
_RC = 'recipe outcome differs: active_owner / '
_RCC = 'recipe check differs: active_owner / '
RECIPE_MUTATIONS = {
    'rule_recipe_keys': ('save_recipe', 'rule', 'recipe-keys', _RC + 'recipe_keys_missing / '),
    'rule_recipe_yield': ('save_recipe', 'rule', 'recipe-yield', _RC + 'recipe_yield_zero / '),
    'rule_recipe_size': ('save_recipe', 'rule', 'recipe-size', _RC + 'recipe_too_many_lines / '),
    'rule_line_keys': ('save_recipe', 'rule', 'line-keys', _RC + 'line_keys_missing / '),
    'rule_line_name': ('save_recipe', 'rule', 'line-name', _RC + 'line_name_blank / '),
    'rule_line_qty': ('save_recipe', 'rule', 'line-qty', _RC + 'line_qty_zero / '),
    'rule_line_unit': ('save_recipe', 'rule', 'line-unit', _RC + 'line_unit_kg / '),
    'rule_line_duplicate': ('save_recipe', 'rule', 'line-duplicate', _RC + 'line_duplicate / '),
    'rule_line_unit_match': ('save_recipe', 'rule', 'line-unit-match', _RC + 'line_unit_mismatch / '),
    'rule_recipe_product': ('save_recipe', 'rule', 'recipe-product', _RC + 'recipe_product_unknown / '),
    'rule_recipe_create_stamp': ('save_recipe', 'rule', 'recipe-create-stamp', _RC + 'recipe_create_with_stamp_unknown / '),
    'rule_recipe_noop': ('save_recipe', 'rule', 'recipe-noop', _RC + 'recipe_create_replay / '),
    'rule_recipe_stale': ('save_recipe', 'rule', 'recipe-stale', _RC + 'recipe_change_stale / '),
}
RECIPE_TABLE_MUTATIONS = {
    'recipes_table_update': ('grant update on public.recipes to anon;', 'recipe outcome differs: anon / recipes_update / '),
}

# C1: the stock ledger (stock-ledger.sql), acting on the last migration that defines each function.
_LG = 'ledger outcome differs: active_owner / '
_LGC = 'ledger check differs: active_owner / '
LEDGER_MUTATIONS = {
    'rule_mv_keys': ('record_stock_movement', 'rule', 'mv-keys', _LG + 'mv_keys_missing / '),
    'rule_mv_id': ('record_stock_movement', 'rule', 'mv-id', _LG + 'mv_id_bad / '),
    'rule_mv_kind': ('record_stock_movement', 'rule', 'mv-kind', _LG + 'mv_kind_bad / '),
    'rule_mv_qty': ('record_stock_movement', 'rule', 'mv-qty', _LG + 'mv_receipt_qty_zero / '),
    'rule_mv_cost': ('record_stock_movement', 'rule', 'mv-cost', _LG + 'mv_cost_negative / '),
    'rule_mv_cost_kind': ('record_stock_movement', 'rule', 'mv-cost-kind', _LG + 'mv_cost_on_waste / '),
    'rule_mv_text': ('record_stock_movement', 'rule', 'mv-text', _LG + 'mv_supplier_long / '),
    'rule_mv_reason': ('record_stock_movement', 'rule', 'mv-reason', _LG + 'mv_waste_no_reason / '),
    'rule_mv_at': ('record_stock_movement', 'rule', 'mv-at', _LG + 'mv_at_future / '),
    'rule_mv_replay_conflict': ('record_stock_movement', 'rule', 'mv-replay-conflict', _LG + 'mv_replay_other_body / '),
    'rule_mv_item_missing': ('record_stock_movement', 'rule', 'mv-item-missing', _LG + 'mv_item_missing / '),
    'rule_mv_item_inactive': ('record_stock_movement', 'rule', 'mv-item-inactive', _LG + 'mv_item_inactive / '),
    'rule_mv_opening_first': ('record_stock_movement', 'rule', 'mv-opening-first', _LG + 'mv_opening_twice / '),
    'rule_mv_count_stale': ('record_stock_movement', 'rule', 'mv-count-stale', _LG + 'mv_count_stale_refused / '),
    'rule_mv_waste_clamp': ('record_stock_movement', 'rule', 'mv-waste-clamp', _LGC + 'mv_waste_stops_at_zero'),
    'rule_mv_receipt_books': ('record_stock_movement', 'rule', 'mv-receipt-books', _LGC + 'mv_receipt_books_the_cost'),
}
LEDGER_TABLE_MUTATIONS = {
    'movements_table_select': ('grant select on public.stock_movements to anon;', 'ledger outcome differs: anon / movements_select / '),
}


def order_mutant(name):
    """The migration's one function, changed in exactly one place, as SQL to run inside the suite."""
    function, kind, argument, _ = (ORDER_MUTATIONS | LOOKUP_MUTATIONS | STAFF_MUTATIONS | SHOP_MUTATIONS | EXTRAS_MUTATIONS | SCHEDULED_MUTATIONS | STOCK_MUTATIONS | RECIPE_MUTATIONS | LEDGER_MUTATIONS)[name]
    marker = 'create or replace function public.' + function + '('
    text = [m.read_text(encoding='utf-8') for m in ORDER_MIGRATIONS if marker in m.read_text(encoding='utf-8')][-1]
    start = text.index('create or replace function public.' + function + '(')
    block = text[start:text.index('\n$$;', start) + len('\n$$;')]
    if kind == 'rule':
        pattern = r'(?m)^(\s*)if\s.*\sthen\s*-- rule:' + re.escape(argument) + r'\s*$'
        block, count = re.subn(pattern, r'\1if false then -- mutated', block)
    else:
        old, new = argument
        count = block.count(old)
        block = block.replace(old, new)
    if count != 1:
        h.fail('order mutation ' + name + ' matched ' + str(count) + ' places, not one')
    return block


SUITES = (
    ('public-catalog.sql', ('catalog_raw_read','catalog_view_update'), 'catalog boundary', 41),
    ('private-role-authority.sql', ('private_orders_select','private_stock_update'), 'private authority', 103),
    ('search-paths.sql', ('lookup_order(text,text)','drop_remaining(uuid)','settings_effective()'), 'search path shadow', 5),
    ('future-object-authority.sql', ('future_table_select','future_sequence_usage'), 'future authority', 24),
    ('auxiliary-authority.sql', ('orders_references','sequence_select','sequence_usage','sequence_update'), 'auxiliary boundary', 46),
    ('trigger-authority.sql', ('orders_trigger', 'touch_updated_at()', 'settings_touch()'), 'trigger boundary', 50),
    ('maintenance.sql', ('consume_rate_limit(text,integer,integer)', 'prune_rate_limits()', 'prune_personal_data(integer)'), 'forbidden maintenance invocation succeeded', 18),
    ('read-rpcs.sql', ('lookup_order(text,text)', 'drop_remaining(uuid)', 'settings_effective()'), 'forbidden read RPC invocation succeeded', 18),
    ('order-inserts.sql', ('orders', 'order_items'), 'forbidden order insert succeeded', 12),
    ('legacy-mutations.sql', ('sync_event_sale(jsonb)', 'update_order_state(text,timestamptz,text,text,text)'), 'legacy EXECUTE boundary missing: active_owner / ', 14),
    ('audit-writes.sql', ('audit_staff_insert',), 'forbidden audit mutation succeeded: active_owner / insert', 30),
    ('table-truncate.sql', ('settings_truncate',), 'forbidden truncate succeeded: anon / settings', 44),
    ('settings.sql', ('settings_staff_read',), 'settings visibility differs: active_helper', 84),
    ('profiles.sql', ('current_role_name_missing_active_filter',), 'profile authority differs: inactive_owner_forged_service', 17),
    ('erasure-authority.sql', ('anonymise_customer(text,text)',), 'erasure ACL boundary missing: anon', 12),
    ('flavours.sql', ('get_flavours()', 'save_flavour(text,jsonb,timestamptz)', 'publish_flavours(text[])'), 'forbidden flavour call succeeded', 52),
    ('bazaar-events.sql', ('start_event(text,text,bigint,uuid)', 'set_event_device(uuid,text)', 'record_event_sale(jsonb)', 'void_event_sale(jsonb)'), 'forbidden bazaar call succeeded', 87),
    ('payment-methods.sql', ('get_payment_methods()', 'save_payment_method(text,jsonb,timestamptz)', 'save_shop_texts(jsonb,timestamptz)',
                             'shop_media_anon_read', 'shop_media_helper_write', 'shop_media_path_unchecked',
                             'payment_tables_raw_write', 'public_read_leaks_inactive'), 'forbidden payment call succeeded', 88),
    ('order-placement.sql', ('get_order_rules()', 'save_order_rules(jsonb,timestamptz)',
                             'orders_rows_leak', 'waitlist_table_select', 'rules_table_select')
                            + tuple(ORDER_MUTATIONS), 'forbidden order call succeeded', 175),
    ('order-lookup.sql', tuple(LOOKUP_MUTATIONS), 'forbidden lookup call succeeded', 24),
    ('staff-orders.sql', STAFF_ACL + tuple(STAFF_MUTATIONS) + tuple(STAFF_TABLE_MUTATIONS), 'forbidden staff order call succeeded', 122),
    ('shop-state.sql', ('set_shop_override(text)',) + tuple(SHOP_MUTATIONS), 'forbidden shop state call succeeded', 29),
    ('order-extras.sql', ('get_order_extras()', 'save_order_extras(jsonb,timestamptz)')
                         + tuple(EXTRAS_MUTATIONS) + tuple(EXTRAS_TABLE_MUTATIONS), 'forbidden extras call succeeded', 143),
    ('scheduled-events.sql', ('get_scheduled_events()', 'save_scheduled_event(jsonb,timestamptz)', 'link_scheduled_event(uuid,uuid)')
                             + tuple(SCHEDULED_MUTATIONS) + tuple(SCHEDULED_TABLE_MUTATIONS), 'forbidden scheduled call succeeded', 69),
    ('stock-catalogue.sql', ('get_stock_catalogue()', 'save_supplier(jsonb,timestamptz)', 'save_stock_item(jsonb,timestamptz)',
                             'save_supplier_price(jsonb,timestamptz)') + tuple(STOCK_MUTATIONS) + tuple(STOCK_TABLE_MUTATIONS),
     'forbidden stock call succeeded', 141),
    ('recipes.sql', ('get_recipes()', 'save_recipe(jsonb,timestamptz)') + tuple(RECIPE_MUTATIONS) + tuple(RECIPE_TABLE_MUTATIONS),
     'forbidden recipe call succeeded', 80),
    ('stock-ledger.sql', ('record_stock_movement(jsonb)', 'get_last_paid()') + tuple(LEDGER_MUTATIONS) + tuple(LEDGER_TABLE_MUTATIONS),
     'forbidden ledger call succeeded', 87),
    ('bazaar-closeout.sql', ('event_summary(uuid)', 'load_event_stock(uuid,jsonb,bigint)', 'add_event_expense(jsonb)', 'close_event(jsonb)'), 'forbidden closeout call succeeded', 80),
)
CATALOG_GUARD_SQL = """
select json_build_object(
  'no_rls', coalesce((select json_agg(c.relname order by c.relname) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity), '[]'::json),
  'views', coalesce((select json_agg(c.relname order by c.relname) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'), '[]'::json),
  'schema_grants', coalesce((select json_agg(role_name order by role_name) from unnest(array['anon','authenticated','service_role']) as role_name
    where has_schema_privilege(role_name, 'hco_private', 'USAGE,CREATE')), '[]'::json),
  'table_grants', coalesce((select json_agg(x order by x) from (
    select concat(role_name,'/',t.relname,'/',priv) as x from pg_class t
      join pg_namespace n on n.oid = t.relnamespace
      cross join unnest(array['anon','authenticated','service_role']) as role_name
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as priv
      where n.nspname = 'hco_private' and t.relkind in ('r','p','v')
        and has_table_privilege(role_name, t.oid, priv)) q), '[]'::json)
)::text;
"""
PAYMENT_MUTATIONS = {
    'shop_media_anon_read': ("create policy \"leak\" on storage.objects for select to anon using (bucket_id = 'shop-media');",
                             'forbidden payment call succeeded: anon / media_list'),
    'shop_media_helper_write': ("create policy \"leak\" on storage.objects for insert to authenticated with check (bucket_id = 'shop-media');",
                                'forbidden payment call succeeded: active_helper / media_insert'),
    'shop_media_path_unchecked': ("alter policy \"shop media owner insert\" on storage.objects with check (bucket_id = 'shop-media' and public.is_owner());",
                                  'forbidden payment call succeeded: active_owner / media_insert_traversal'),
    'payment_tables_raw_write': ("grant select, insert, update, delete on public.payment_methods to authenticated; create policy \"leak\" on public.payment_methods for all to authenticated using (public.is_owner()) with check (public.is_owner());",
                                 'forbidden payment call succeeded: active_helper / methods_table_select'),
    'public_read_leaks_inactive': ("create or replace function public.get_shop_payment_info() returns jsonb language sql stable security definer set search_path = '' as $f$ select jsonb_build_object('methods', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'label', m.label, 'number', m.account_number, 'name', m.account_name, 'qr', m.qr_path) order by m.sort_order, m.id) from public.payment_methods m), '[]'::jsonb), 'texts', coalesce((select jsonb_build_object('registration_badge', t.registration_badge, 'tin_line', t.tin_line, 'invoice_note', t.invoice_note, 'allergen_note', t.allergen_note, 'updated_at', t.updated_at) from public.shop_texts t), jsonb_build_object('registration_badge', '', 'tin_line', '', 'invoice_note', '', 'allergen_note', '', 'updated_at', null))); $f$;",
                                   'public payment read differs: anon_default'),
}

REPORT = ROOT / "docs/state/evidence/MP-06l-security.json"
EMPTY_FIXTURES = 'select ' + ' and '.join(
    'not exists(select 1 from public.' + table + ')'
    for table in ('orders', 'order_items', 'products', 'drops', 'settings', 'rate_limits', 'profiles', 'audit_log', 'ledger_entries', 'event_sales', 'event_sale_items', 'inventory_items', 'bake_batches', 'recipes', 'recipe_ingredients', 'suppliers', 'supplier_prices', 'events', 'erasure_requests', 'payment_methods', 'shop_texts', 'waitlist_entries', 'order_add_ons', 'order_boxes', 'scheduled_events', 'recipe_versions', 'stock_movements')) + " and not exists(select 1 from auth.users) and to_regnamespace('mp06f_probe') is null and to_regnamespace('mp06g_probe') is null and to_regclass('public.mp06g_future') is null and to_regclass('public.mp06g_future_id_seq') is null;"


def main():
    if len(sys.argv) != 1:
        h.fail("security fixture accepts no URLs, project refs or arguments")
    report = {"status": "failed", "scope": "Local SQL-role containment and erasure authority/effects; not JWT/API, hosted erasure or full MP-06 acceptance", "runs": [], "regressions_detected": [], "upgrade_runs": 0, "legacy_regression_diagnostics": [], "sequence_restorations": 0, "function_guard_runs": 0, "catalog_guard_runs": 0, "catalog_guard_red_runs": 0}

    def check(db_id, workdir, password, fixture_report):
        def assert_functions():
            query = (ROOT / 'tests/integration/db/schema-inventory.sql').read_text(encoding='utf-8')
            verify_functions(json.loads(h.psql(db_id, workdir, query))['functions'])
            report['function_guard_runs'] += 1
        def assert_catalog_wide():
            result = json.loads(h.psql(db_id, workdir, CATALOG_GUARD_SQL))
            if result['no_rls']:
                h.fail('catalog guard: public relation(s) without row-level security: ' + ','.join(result['no_rls']))
            if result['views'] != ['shop_drops', 'shop_products']:
                h.fail('catalog guard: unexpected public view set: ' + ','.join(result['views']))
            if result['schema_grants'] or result['table_grants']:
                h.fail('catalog guard: an API role has a privilege in hco_private')
            report['catalog_guard_runs'] += 1
        def assert_catalog_wide_red():
            # Deliberately create a public table with RLS left off; the guard must flag it, then roll back.
            probe = 'begin; create table public.mp06p_catalog_guard_probe(id integer);\n' + CATALOG_GUARD_SQL + '\nrollback;'
            result = json.loads(h.psql(db_id, workdir, probe).strip())
            if 'mp06p_catalog_guard_probe' not in result['no_rls']:
                h.fail('catalog guard failed to detect a public table without row-level security')
            report['catalog_guard_red_runs'] += 1
            # Deliberately widen hco_private to PUBLIC (not a named API role); the
            # guard must still flag it via has_schema_privilege/has_table_privilege,
            # which fold PUBLIC in, then roll back.
            probe = ('begin; grant usage on schema hco_private to public;'
                      ' grant select on hco_private.bff_sessions to public;\n'
                      + CATALOG_GUARD_SQL + '\nrollback;')
            result = json.loads(h.psql(db_id, workdir, probe).strip())
            if not result['schema_grants'] or not any('bff_sessions' in item for item in result['table_grants']):
                h.fail('catalog guard failed to detect a PUBLIC grant into hco_private')
            report['catalog_guard_red_runs'] += 1
        assert_functions()
        assert_catalog_wide_red()
        assert_catalog_wide()
        def assert_empty():
            # Every call opens a fresh connection, independent of the test transaction.
            if h.psql(db_id, workdir, EMPTY_FIXTURES).strip() != 't':
                h.fail('security fixture tables are not empty after rollback or before tests')
        def run_suite(sql, auxiliary=False):
            if not auxiliary:
                return h.psql(db_id, workdir, sql)
            state_sql = "select json_build_object('value',last_value,'called',is_called) from public.audit_log_id_seq;"
            before = json.loads(h.psql(db_id, workdir, state_sql))
            try:
                return h.psql(db_id, workdir, sql)
            finally:
                value, called = before['value'], before['called']
                if type(value) is not int or type(called) is not bool:
                    h.fail('sequence snapshot has invalid shape')
                h.psql(db_id, workdir, f"select setval('public.audit_log_id_seq',{value},{str(called).lower()});")
                if json.loads(h.psql(db_id, workdir, state_sql)) != before:
                    h.fail('owned audit sequence restoration failed')
                report['sequence_restorations'] += 1
        assert_empty()
        upgrade = (ROOT / 'tests/integration/security/profile-upgrade.sql').read_text(encoding='utf-8')
        migration = (ROOT / 'supabase/migrations/20260101001100_active_profile_authority.sql').read_text(encoding='utf-8')
        if h.psql(db_id, workdir, upgrade.replace('__ACTIVE_MIGRATION__', migration)).splitlines().count('UPGRADE|passed') != 1:
            h.fail('populated profile upgrade proof missing')
        assert_empty()
        report['upgrade_runs'] += 1
        results = []
        for filename, signatures, forbidden, expected in SUITES:
            raw_sql = (ROOT / 'tests/integration/security' / filename).read_text(encoding='utf-8')
            sql = raw_sql.replace('__FUTURE_RED_GRANT__', '').replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', '').replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', '')
            for signature in signatures:
                # Failed psql closes the connection and rolls back synthetic grant/data.
                table_test = filename == 'order-inserts.sql'
                grant = 'grant insert on table public.' if table_test else 'grant execute on function public.'
                operation = signature + '_insert' if table_test else signature.split('(')[0]
                broken = sql.replace('begin;', 'begin;\n' + grant + signature + ' to anon;', 1)
                expected_error = forbidden + ': anon / ' + operation
                if filename == 'order-placement.sql':
                    if signature in ORDER_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;\n' + order_mutant(signature), 1)
                        expected_error = ORDER_MUTATIONS[signature][3]
                    elif signature in ORDER_TABLE_MUTATIONS:
                        unsafe, expected_error = ORDER_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'order-lookup.sql':
                    broken = sql.replace('begin;', 'begin;\n' + order_mutant(signature), 1)
                    expected_error = LOOKUP_MUTATIONS[signature][3]
                if filename == 'staff-orders.sql':
                    if signature in STAFF_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = STAFF_MUTATIONS[signature][3]
                    elif signature in STAFF_TABLE_MUTATIONS:
                        unsafe, expected_error = STAFF_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'scheduled-events.sql':
                    if signature in SCHEDULED_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = SCHEDULED_MUTATIONS[signature][3]
                    elif signature in SCHEDULED_TABLE_MUTATIONS:
                        unsafe, expected_error = SCHEDULED_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'stock-catalogue.sql':
                    if signature in STOCK_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = STOCK_MUTATIONS[signature][3]
                    elif signature in STOCK_TABLE_MUTATIONS:
                        unsafe, expected_error = STOCK_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'recipes.sql':
                    if signature in RECIPE_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = RECIPE_MUTATIONS[signature][3]
                    elif signature in RECIPE_TABLE_MUTATIONS:
                        unsafe, expected_error = RECIPE_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'stock-ledger.sql':
                    if signature in LEDGER_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = LEDGER_MUTATIONS[signature][3]
                    elif signature in LEDGER_TABLE_MUTATIONS:
                        unsafe, expected_error = LEDGER_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'order-extras.sql':
                    if signature in EXTRAS_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = EXTRAS_MUTATIONS[signature][3]
                    elif signature in EXTRAS_TABLE_MUTATIONS:
                        unsafe, expected_error = EXTRAS_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'shop-state.sql' and signature in SHOP_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = SHOP_MUTATIONS[signature][3]
                if filename == 'payment-methods.sql' and signature in PAYMENT_MUTATIONS:
                    unsafe, expected_error = PAYMENT_MUTATIONS[signature]
                    broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'profiles.sql':
                    # Restore only the missing active filter, within the failing transaction.
                    unsafe = "create or replace function public.current_role_name() returns public.app_role language sql stable security definer set search_path='' as $$ select p.role from public.profiles p where p.id=auth.uid() $$;"
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'settings.sql':
                    unsafe = 'create policy "settings staff read" on public.settings for select using (public.is_staff());'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'table-truncate.sql':
                    broken = sql.replace('begin;', 'begin;\ngrant truncate on public.settings to anon;', 1)
                    expected_error = forbidden
                if filename == 'audit-writes.sql':
                    unsafe = 'grant insert on public.audit_log to authenticated; create policy "audit staff insert" on public.audit_log for insert with check (public.is_staff());'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'legacy-mutations.sql':
                    broken = sql.replace('begin;', 'begin;\ngrant execute on function public.' + signature + ' to authenticated;', 1)
                    expected_error = forbidden + signature.split('(')[0]
                if filename == 'trigger-authority.sql':
                    if signature == 'orders_trigger':
                        unsafe = 'grant trigger on public.orders to anon;'
                        expected_error = 'trigger table boundary missing: anon / orders'
                    else:
                        unsafe = 'grant execute on function public.' + signature + ' to anon;'
                        expected_error = 'trigger function boundary missing: anon / ' + signature.split('(')[0]
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'auxiliary-authority.sql':
                    if signature == 'orders_references':
                        unsafe = 'grant references on public.orders to anon;'
                        expected_error = 'references boundary missing: anon / orders'
                    else:
                        privilege = signature.split('_')[1]
                        unsafe = 'grant ' + privilege + ' on sequence public.audit_log_id_seq to anon;'
                        expected_error = 'sequence boundary missing: anon / ' + {'select':'read','usage':'nextval','update':'setval'}[privilege]
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'future-object-authority.sql':
                    if signature == 'future_table_select':
                        unsafe = 'grant select on public.mp06g_future to anon;'
                        expected_error = 'forbidden future table operation succeeded: anon / select'
                    else:
                        unsafe = 'grant usage on sequence public.mp06g_future_id_seq to anon;'
                        expected_error = 'forbidden future sequence operation succeeded: anon / nextval'
                    broken = raw_sql.replace('__FUTURE_RED_GRANT__', unsafe)
                if filename == 'private-role-authority.sql':
                    if signature == 'private_orders_select':
                        unsafe = 'alter policy "orders staff read" on public.orders using (public.is_staff());'
                        broken = raw_sql.replace('__PRIVATE_RED_POLICY__', unsafe).replace('__PRIVATE_RED_UPDATE_POLICY__', '')
                        expected_error = 'private read differs: active_helper / orders / 1'
                    else:
                        unsafe = 'alter policy "stock staff read" on public.inventory_items using (public.is_staff()); alter policy "stock staff write" on public.inventory_items using (public.is_staff()) with check (public.is_staff());'
                        broken = raw_sql.replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', 'reset role; ' + unsafe + ' set local role authenticated;')
                        # A3 revoked UPDATE on inventory_items from the API roles (writes go through save_stock_item), as B3 did
                        # for orders: the widened policy is now caught by the read check, and the write by stock-catalogue.sql.
                        expected_error = 'private read differs: active_support / inventory_items / 1'
                if filename == 'public-catalog.sql':
                    if signature == 'catalog_raw_read':
                        unsafe = 'alter policy "catalogue public read" on public.products using (active or public.is_staff());'
                        broken = raw_sql.replace('__CATALOG_RED_POLICY__', unsafe).replace('__CATALOG_RED_VIEW_GRANT__', '')
                        expected_error = 'raw visibility differs: anon'
                    else:
                        broken = raw_sql.replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', 'grant update on public.shop_products to anon;')
                        expected_error = 'view mutation succeeded: anon / shop_products / update'
                if filename == 'search-paths.sql':
                    unsafe = 'alter function public.' + signature + ' set search_path=public;'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = 'search path shadow: ' + signature.split('(')[0]
                if filename == 'erasure-authority.sql':
                    expected_error = forbidden
                try:
                    run_suite(broken, filename == 'auxiliary-authority.sql')
                except RuntimeError as error:
                    if expected_error not in str(error):
                        raise
                    report['regressions_detected'].append(signature)
                    if filename == 'legacy-mutations.sql':
                        report['legacy_regression_diagnostics'].append(str(error))
                else:
                    h.fail('role suite failed to detect a deliberately restored unsafe grant: ' + filename + ' / ' + signature)
                assert_empty()
            output = run_suite(sql, filename == 'auxiliary-authority.sql')
            rows = [line for line in output.splitlines() if line.startswith('SEC_RESULT|')]
            if len(rows) != expected or len(set(rows)) != expected:
                h.fail(filename + ' did not return its complete role matrix')
            results.extend(rows)
            assert_empty()
        if len(set(results)) != 1695:
            h.fail('combined role matrix has missing or duplicate cases: %d rows, %d unique (duplicates: %s)' % (len(results), len(set(results)), sorted({r for r in results if results.count(r) > 1})[:5]))
        assert_functions()
        assert_catalog_wide()
        h.catalog(db_id, workdir, h.sql_for(h.expected_versions()))
        report["runs"].append(sorted(results))

    h.REPORT = ROOT / "docs/state/evidence/MP-06l-bootstrap.json"
    # Replace an older pass before bootstrap preflight can fail.
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    try:
        code = h.main(after_reset=check)
        if (code == 0 and len(report["runs"]) == 2 and report["runs"][0] == report["runs"][1]
                and len(report['regressions_detected']) == 508 and report['sequence_restorations'] == 10
                and report['upgrade_runs'] == 2 and report['function_guard_runs'] == 4
                and report['catalog_guard_runs'] == 4 and report['catalog_guard_red_runs'] == 4):
            report.update(status="passed", cases_per_reset=1695, resets=2, matrix_equal=True, rollback_verified=True,
                          sql_sha256={name: hashlib.sha256((ROOT / 'tests/integration/security' / name).read_bytes()).hexdigest() for name, _, _, _ in SUITES},
                          harness_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    except (RuntimeError, OSError, ValueError) as error:
        report['error'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    finally:
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report.get(key) for key in ("status", "cases_per_reset", "resets")}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
