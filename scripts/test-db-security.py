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
                    ROOT / 'supabase/migrations/20260101004600_stock_ledger.sql',
                    ROOT / 'supabase/migrations/20260101004700_production.sql',
                    ROOT / 'supabase/migrations/20260101004800_production_discard.sql',
                    ROOT / 'supabase/migrations/20260101004900_books.sql',
                    ROOT / 'supabase/migrations/20260101005000_operations.sql',
                    ROOT / 'supabase/migrations/20260101005400_business_clock_shop_identity.sql',
                    ROOT / 'supabase/migrations/20260101005500_identity_links.sql',
                    ROOT / 'supabase/migrations/20260101005600_item_costs.sql',
                    ROOT / 'supabase/migrations/20260101005700_clock_policies.sql',
                    ROOT / 'supabase/migrations/20260101005800_batch_correction.sql',
                    ROOT / 'supabase/migrations/20260101005900_packaging_rules.sql',
                    ROOT / 'supabase/migrations/20260101006000_books_used.sql',
                    ROOT / 'supabase/migrations/20260101006100_cost_cutover.sql',
                    ROOT / 'supabase/migrations/20260101006200_cost_cutover_fix.sql',
                    ROOT / 'supabase/migrations/20260101006300_her_data_imports.sql',
                    ROOT / 'supabase/migrations/20260101006400_cutover_guard.sql',
                    ROOT / 'supabase/migrations/20260101006500_count_shrinkage.sql',
                    ROOT / 'supabase/migrations/20260101006600_item_movements.sql',
                    ROOT / 'supabase/migrations/20260101006700_bazaar_days.sql',
                    ROOT / 'supabase/migrations/20260101006800_bazaar_hardening.sql',
                    ROOT / 'supabase/migrations/20260101006900_flavour_cost_closing_reversal.sql']
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
                                ("notes = '', ig = '',\n           status_token = null, payload_hash = null", "notes = '',\n           status_token = null, payload_hash = null"), 'prune kept personal data'),
    'text_prune_keeps_waitlist': ('prune_personal_data', 'text',
                                  ("delete from public.waitlist_entries where created_at < v_now - interval '365 days';", 'null;'),
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
                              ("update public.order_add_ons a set note = null\n    from public.orders o\n   where a.order_id = o.id and o.placed_at < v_now - interval '365 days' and a.note is not null;",
                               "update public.order_add_ons a set note = null\n    from public.orders o\n   where a.order_id = o.id and o.placed_at < v_now - interval '365 days' and o.phone <> '' and a.note is not null;"), 'extras check differs: prune kept the note'),
}
EXTRAS_TABLE_MUTATIONS = {
    'extras_table_select': ('grant select on public.order_extras to anon;', _EXO + 'extras_table_select / '),
    'add_ons_table_select': ('grant select on public.order_add_ons to anon;', _EXO + 'add_ons_table_select / '),
    'boxes_table_select': ('grant select on public.order_boxes to anon;', _EXO + 'boxes_table_select / '),
}

# D4: the owner's scheduled bazaar events (scheduled-events.sql), acting on the last migration that defines each function.
_SC = 'scheduled outcome differs: active_owner / '
SCHEDULED_MUTATIONS = {
    'rule_sched_keys': ('write_scheduled_event', 'rule', 'keys', _SC + 'save_keys_missing / '),
    'rule_sched_text': ('write_scheduled_event', 'rule', 'text', _SC + 'save_name_blank / '),
    'rule_sched_dates': ('write_scheduled_event', 'rule', 'dates', _SC + 'save_ends_before_start / '),
    'rule_sched_rent': ('write_scheduled_event', 'rule', 'rent', _SC + 'save_rent_negative / '),
    'rule_sched_create_stamp': ('write_scheduled_event', 'rule', 'create-stamp', _SC + 'create_with_stamp_unknown / '),
    'rule_sched_replay': ('write_scheduled_event', 'rule', 'replay', _SC + 'create_replay / '),
    'rule_sched_stale': ('write_scheduled_event', 'rule', 'stale', _SC + 'change_stale / '),
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
    'rule_item_keys': ('write_stock_item', 'rule', 'item-keys', _ST + 'item_keys_missing / '),
    'rule_item_id': ('write_stock_item', 'rule', 'item-id', _ST + 'item_id_bad / '),
    'rule_item_text': ('write_stock_item', 'rule', 'item-text', _ST + 'item_name_blank / '),
    'rule_item_category': ('write_stock_item', 'rule', 'item-category', _ST + 'item_category_bad / '),
    'rule_item_numbers': ('write_stock_item', 'rule', 'item-numbers', _ST + 'item_par_negative / '),
    'rule_item_useby': ('write_stock_item', 'rule', 'item-useby', _ST + 'item_useby_zero / '),
    'rule_item_supplier': ('write_stock_item', 'rule', 'item-supplier', _ST + 'item_supplier_unknown / '),
    'rule_item_name_taken': ('write_stock_item', 'rule', 'item-name-taken', _ST + 'item_name_taken / '),
    'rule_item_create_stamp': ('write_stock_item', 'rule', 'item-create-stamp', _ST + 'item_create_with_stamp_unknown / '),
    'rule_item_replay': ('write_stock_item', 'rule', 'item-replay', _ST + 'item_create_replay / '),
    'rule_item_stale': ('write_stock_item', 'rule', 'item-stale', _ST + 'item_change_stale / '),
    'rule_item_rename_referenced': ('write_stock_item', 'rule', 'item-rename-referenced', _ST + 'item_rename_referenced / '),
    'rule_item_unit_referenced': ('write_stock_item', 'rule', 'item-unit-referenced', _ST + 'item_unit_change_referenced / '),
    'rule_price_keys': ('save_supplier_price', 'rule', 'price-keys', _ST + 'price_keys_missing / '),
    'rule_price_text': ('save_supplier_price', 'rule', 'price-text', _ST + 'price_label_blank / '),
    'rule_price_cents': ('save_supplier_price', 'rule', 'price-cents', _ST + 'price_cents_negative / '),
    'rule_price_supplier': ('save_supplier_price', 'rule', 'price-supplier', _ST + 'price_supplier_unknown / '),
    'rule_price_item': ('save_supplier_price', 'rule', 'price-item', _ST + 'price_item_unknown / '),
    'rule_price_pack_size': ('save_supplier_price', 'rule', 'price-pack-size', _ST + 'price_pack_size_zero / '),
    'text_price_repoint_clears_size': ('save_supplier_price', 'text',
                                       ('when v_has_pack then v_pack when v_item_id is distinct from p.item_id then null else p.pack_size end',
                                        'when v_has_pack then v_pack else p.pack_size end'),
                                       _STC + 'price_repoint_clears_size'),
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
    'rule_recipe_keys': ('write_recipe', 'rule', 'recipe-keys', _RC + 'recipe_keys_missing / '),
    'rule_recipe_yield': ('write_recipe', 'rule', 'recipe-yield', _RC + 'recipe_yield_zero / '),
    'rule_recipe_size': ('write_recipe', 'rule', 'recipe-size', _RC + 'recipe_too_many_lines / '),
    'rule_line_keys': ('write_recipe', 'rule', 'line-keys', _RC + 'line_keys_missing / '),
    'rule_line_name': ('write_recipe', 'rule', 'line-name', _RC + 'line_name_blank / '),
    'rule_line_qty': ('write_recipe', 'rule', 'line-qty', _RC + 'line_qty_zero / '),
    'rule_line_unit': ('write_recipe', 'rule', 'line-unit', _RC + 'line_unit_kg / '),
    'rule_line_duplicate': ('write_recipe', 'rule', 'line-duplicate', _RC + 'line_duplicate / '),
    'rule_line_unit_match': ('write_recipe', 'rule', 'line-unit-match', _RC + 'line_unit_mismatch / '),
    'rule_line_item_unknown': ('write_recipe', 'rule', 'line-item-unknown', _RC + 'line_item_unknown / '),
    'rule_recipe_product': ('write_recipe', 'rule', 'recipe-product', _RC + 'recipe_product_unknown / '),
    'rule_recipe_create_stamp': ('write_recipe', 'rule', 'recipe-create-stamp', _RC + 'recipe_create_with_stamp_unknown / '),
    'rule_recipe_noop': ('write_recipe', 'rule', 'recipe-noop', _RC + 'recipe_create_replay / '),
    'rule_recipe_stale': ('write_recipe', 'rule', 'recipe-stale', _RC + 'recipe_change_stale / '),
}
RECIPE_TABLE_MUTATIONS = {
    'recipes_table_update': ('grant update on public.recipes to anon;', 'recipe outcome differs: anon / recipes_update / '),
}

# B3a: links by identity (identity-links.sql), acting on the last migration that defines each function. The operator
# (postgres) runs both functions; the cases name that actor.
_LK = 'link outcome differs: operator / '
LINK_MUTATIONS = {
    'rule_link_expected': ('apply_identity_links', 'rule', 'link-expected', _LK + 'link_expected_null / '),
    'rule_link_count_changed': ('apply_identity_links', 'rule', 'link-count-changed', _LK + 'link_apply_stale / '),
    'text_link_validates_only_when_clean': ('apply_identity_links', 'text',
                                            (" and jsonb_array_length(v_post -> 'production' -> 'missing_version') = 0 then", " then"),
                                            'violates foreign key constraint'),
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


# C2: production (production.sql), acting on the last migration that defines each function.
_PD = 'production outcome differs: active_owner / '
_PDC = 'production check differs: active_owner / '
PRODUCTION_MUTATIONS = {
    'rule_prod_keys': ('record_production', 'rule', 'prod-keys', _PD + 'prod_keys_missing / '),
    'rule_prod_id': ('record_production', 'rule', 'prod-id', _PD + 'prod_id_bad / '),
    'rule_prod_kind': ('record_production', 'rule', 'prod-kind', _PD + 'prod_kind_pack / '),
    'rule_prod_qty': ('record_production', 'rule', 'prod-qty', _PD + 'prod_qty_zero / '),
    'rule_prod_rejects': ('record_production', 'rule', 'prod-rejects', _PD + 'prod_rejects_over / '),
    'rule_prod_target': ('record_production', 'rule', 'prod-target', _PD + 'prod_target_missing / '),
    'rule_prod_at': ('record_production', 'rule', 'prod-at', _PD + 'prod_at_future / '),
    'rule_prod_adj_dough': ('record_production', 'rule', 'prod-adj-dough', _PD + 'prod_adj_on_dough / '),
    'rule_prod_adj_range': ('record_production', 'rule', 'prod-adj-range', _PD + 'prod_adj_range / '),
    'rule_prod_replay_conflict': ('record_production', 'rule', 'prod-replay-conflict', _PD + 'prod_replay_other_body / '),
    'rule_prod_no_recipe': ('record_production', 'rule', 'prod-no-recipe', _PD + 'prod_no_recipe / '),
    'rule_prod_stale_version': ('record_production', 'rule', 'prod-stale-version', _PD + 'prod_stale_version / '),
    'rule_prod_dough_size': ('record_production', 'rule', 'prod-dough-size', _PD + 'prod_dough_too_big / '),
    'rule_prod_adj_unknown': ('record_production', 'rule', 'prod-adj-unknown', _PD + 'prod_adj_unknown / '),
    'rule_prod_shortfall': ('record_production', 'rule', 'prod-shortfall', _PDC + 'prod_shortfall_recorded'),
    'rule_pack_order_missing': ('record_pack', 'rule', 'pack-order-missing', _PD + 'pack_order_missing / '),
    'rule_pack_empty': ('record_pack', 'rule', 'pack-empty', _PD + 'pack_empty / '),
    'rule_pack_shortfall': ('record_pack', 'rule', 'pack-shortfall', _PDC + 'pack_shortfall_recorded'),
    'rule_sale_packaging_live': ('record_event_sale', 'rule', 'sale-packaging-live', _PDC + 'sale_uses_packaging'),
    'text_sale_packaging_voided': ('record_event_sale', 'text',
                                   ('if v_voided is null then -- rule:sale-packaging-live', 'if true then -- rule:sale-packaging-live'),
                                   _PDC + 'sale_voided_uses_nothing'),
    'text_use_never_more': ('use_stock_item', 'text', ('least(p_qty, v_item.on_hand)', 'p_qty'),
                            _PDC + 'prod_batch_takes_what_is_there'),
    'text_dough_first': ('record_production', 'text', ('v_used := least(greatest(v_bal, 0), v_qty)::integer;', 'v_used := 0;'),
                         _PDC + 'prod_batch_uses_dough_first'),
    'text_pcs_round_up': ('recipe_stock_plan', 'text', ('ceil(v_raw)', 'round(v_raw, 1)'),
                          _PDC + 'prod_dough_takes_the_scaled_lines'),
    'text_multiply_first': ('recipe_stock_plan', 'text', ('v_raw := v_line.qty * v_mixed / v_recipe.yield_count;', 'v_raw := v_line.qty * (v_mixed / v_recipe.yield_count);'),
                            _PDC + 'prod_dough_pieces_not_rounded_up'),
    'text_ml_step': ('recipe_stock_plan', 'text', ("when 'ml' then 5", "when 'ml' then 10"), _PDC + 'prod_ml_step_and_rounding'),
    'rule_disc_keys': ('record_discard', 'rule', 'disc-keys', _PD + 'disc_keys_missing / '),
    'rule_disc_id': ('record_discard', 'rule', 'disc-id', _PD + 'disc_id_bad / '),
    'rule_disc_kind': ('record_discard', 'rule', 'disc-kind', _PD + 'disc_kind_bad / '),
    'rule_disc_qty': ('record_discard', 'rule', 'disc-qty', _PD + 'disc_qty_zero / '),
    'rule_disc_reason': ('record_discard', 'rule', 'disc-reason', _PD + 'disc_reason_blank / '),
    'rule_disc_at': ('record_discard', 'rule', 'disc-at', _PD + 'disc_at_future / '),
    'rule_disc_replay_conflict': ('record_discard', 'rule', 'disc-replay-conflict', _PD + 'disc_replay_other_body / '),
    'rule_disc_more_than_there': ('record_discard', 'rule', 'disc-more-than-there', _PD + 'disc_dough_more_than_there / '),
    'text_discard_dough_balance': ('record_production', 'text', ("when 'discard_dough' then -r.qty else -r.dough_used end), 0) into v_bal", "else -r.dough_used end), 0) into v_bal"),
                                   _PDC + 'prod_discard_reduces_dough'),
    'text_discard_dough_read': ('get_production', 'text', ("when 'discard_dough' then -r.qty else -r.dough_used end)::integer as balls", "else -r.dough_used end)::integer as balls"),
                                _PDC + 'get_production_dough_after_discard'),
    'text_discard_baked_read': ('get_production', 'text', ("select r.product_id, -r.qty from public.production_records r where r.kind = 'discard_baked'", "select r.product_id, 0 from public.production_records r where r.kind = 'discard_baked'"),
                                _PDC + 'get_production_baked_after_discard'),
    'text_sale_never_costs_the_short': ('record_sale_packaging', 'text', ("'Bazaar sale', p_at, false)", "'Bazaar sale', p_at, true)"), _PDC + 'sale_pin_empty_movements'),
    'text_pack_once': ('record_pack', 'text', ("v_id := md5('pack:' || p_order)::uuid;", 'v_id := gen_random_uuid();'),
                       _PDC + 'pack_twice_takes_nothing_more'),
    'text_baked_minus_packed': ('get_production', 'text', ('select oi.product_id, -oi.qty from public.production_records r', 'select oi.product_id, 0 from public.production_records r'),
                                _PDC + 'get_production_baked_not_packed'),
}
PRODUCTION_TABLE_MUTATIONS = {
    'records_table_select': ('grant select on public.production_records to anon;', 'production outcome differs: anon / records_select / '),
}


# B3b-1: packaging as records (packaging.sql), acting on migration 60. The rule mutants neutralise one tagged refusal; the text
# mutants restate one line of the plan. Each expected text is the first case of the suite that must then fail.
_PK = 'packaging outcome differs: '
_PKC = 'packaging check differs: '
PACKAGING_MUTATIONS = {
    'rule_packrule_keys': ('write_packaging_rule', 'rule', 'packrule-keys', _PK + 'active_owner / rule_keys_missing / '),
    'rule_packrule_container': ('write_packaging_rule', 'rule', 'packrule-container', _PK + 'active_owner / rule_container_bad / '),
    'rule_packrule_box_size': ('write_packaging_rule', 'rule', 'packrule-box-size', _PK + 'active_owner / rule_box_size_missing / '),
    'rule_packrule_lines_max': ('write_packaging_rule', 'rule', 'packrule-lines-max', _PK + 'active_owner / rule_lines_max / '),
    'rule_packrule_item_missing': ('write_packaging_rule', 'rule', 'packrule-item-missing', _PK + 'active_owner / rule_item_missing / '),
    'rule_packrule_qty': ('write_packaging_rule', 'rule', 'packrule-qty', _PK + 'operator / apply_validates_like_save / '),
    'rule_packrule_per': ('write_packaging_rule', 'rule', 'packrule-per', _PK + 'active_owner / rule_per_bad / '),
    'rule_packrule_dup': ('write_packaging_rule', 'rule', 'packrule-dup', _PK + 'active_owner / rule_item_twice / '),
    'rule_packrule_double': ('write_packaging_rule', 'rule', 'packrule-double', _PK + 'active_owner / rule_double_take_cookie / '),
    'rule_packrule_ingredient': ('write_packaging_rule', 'rule', 'packrule-ingredient', _PK + 'operator / packrule_ingredient_refused_apply / '),
    'rule_packrule_double_order': ('write_packaging_rule', 'rule', 'packrule-double-order', _PK + 'active_owner / rule_double_take_order_vs_loose / '),
    'rule_packrule_name_keys': ('apply_packaging_rule', 'rule', 'packrule-name-keys', _PK + 'operator / apply_keys_extra / '),
    'rule_packrule_apply_dup': ('apply_packaging_rule', 'rule', 'packrule-apply-dup', _PK + 'operator / apply_container_twice / '),
    'rule_packrule_name': ('apply_packaging_rule', 'rule', 'packrule-name', _PK + 'operator / apply_name_several / '),
    'rule_recipe_kind': ('write_recipe', 'rule', 'recipe-kind', _PK + 'active_owner / recipe_kind_bad / '),
    'rule_recipe_pack_double': ('write_recipe', 'rule', 'recipe-pack-double', _PK + 'active_owner / recipe_pack_double / '),
    'rule_pack_no_loose_rule': ('record_pack', 'rule', 'pack-no-loose-rule', _PKC + 'active_owner / pack_flags_loose_without_a_rule'),
    'rule_pack_no_order_rule': ('record_pack', 'rule', 'pack-no-order-rule', _PKC + 'active_owner / pack_flags_order_without_a_rule'),
    'rule_sale_no_rule': ('record_sale_packaging', 'rule', 'sale-no-rule', _PKC + 'active_owner / sale_without_rule_flagged'),
    'text_pack_loose_is_the_rest': ('record_pack', 'text', ('v_loose := greatest(v_count - v_boxed, 0);', 'v_loose := v_count;'),
                                    _PKC + 'active_owner / pack_takes_by_the_boxes'),
    'text_pack_box_per_cookie': ('record_pack', 'text', ("when 'cookie' then bx.size * bx.n else bx.n end", "when 'cookie' then bx.n else bx.n end"),
                                 _PKC + 'active_owner / pack_per_cookie_lines_count_the_cookies'),
    'text_pack_order_per_cookie': ('record_pack', 'text', ("case r.per when 'cookie' then v_count else 1 end", "case r.per when 'cookie' then 1 else 1 end"),
                                   _PKC + 'active_owner / pack_per_cookie_lines_count_the_cookies'),
    'text_pack_recipe_lines_per_cookie': ('record_pack', 'text', ('select 4, 0, l.position, l.item_id, l.qty * oi.q', 'select 4, 0, l.position, l.item_id, l.qty'),
                                          _PKC + 'active_owner / pack_takes_the_recipe_packaging'),
    'text_pack_flags_box_without_rule': ('record_pack', 'text',
                                         ("where not exists (select 1 from public.packaging_rules r where r.container = 'box' and r.box_size = bx.size)",
                                          "where false and not exists (select 1 from public.packaging_rules r where r.container = 'box' and r.box_size = bx.size)"),
                                         _PKC + 'active_owner / pack_box_without_a_rule_is_flagged'),
    'text_pack_never_costs_the_short': ('record_pack', 'text', ("'Packed order ' || p_order, v_at, false)", "'Packed order ' || p_order, v_at, true)"),
                                        _PKC + 'active_owner / pack_all_loose'),
    'text_sale_in_position_order': ('record_sale_packaging', 'text', ('row_number() over (order by x.src, x.pos, x.item_id)', 'row_number() over (order by x.src, x.pos desc, x.item_id)'),
                                    _PKC + 'active_owner / sale_with_rule_keeps_the_movement_ids'),
    'text_sale_per_cookie': ('record_sale_packaging', 'text', ("r.qty * case r.per when 'cookie' then p_cookies else 1 end", 'r.qty * 1'),
                             _PKC + 'active_owner / sale_with_rule_takes_in_order'),
    'text_sale_recipe_lines_per_cookie': ('record_sale_packaging', 'text', ('select 2, l.position, l.item_id, l.qty * si.q', 'select 2, l.position, l.item_id, l.qty'),
                                          _PKC + 'active_owner / sale_without_rule_takes_recipe_packaging'),
    'text_bake_skips_packaging': ('recipe_stock_plan', 'text', ("where i.product_id = v_pid and i.kind = 'ingredient' order by i.position, i.id loop", 'where i.product_id = v_pid order by i.position, i.id loop'),
                                  _PKC + 'active_owner / bake_skips_packaging'),
    'text_bake_adj_ingredients_only': ('record_production', 'text', ("where i.product_id = v_pid and i.kind = 'ingredient' and i.item_name = k));", 'where i.product_id = v_pid and i.item_name = k));'),
                                       _PK + 'active_owner / bake_adj_names_a_packaging_line / '),
    'text_recipe_pack_double_loose': ('write_recipe', 'text', ("(r.per = 'cookie' or r.container = 'loose')", "r.per = 'cookie'"),
                                      _PK + 'active_owner / recipe_pack_double_loose_container / '),
    'text_recipes_read_the_kind': ('get_recipes', 'text', ("'item_id', i.item_id, 'kind', i.kind)", "'item_id', i.item_id, 'kind', 'ingredient')"),
                                   _PKC + 'active_owner / get_recipes_lines_have_a_kind'),
    'text_recipe_stores_the_kind': ('write_recipe', 'text', ("|| case when l ->> 'kind' = 'packaging' then jsonb_build_object('kind', 'packaging') else '{}'::jsonb end", "|| '{}'::jsonb"),
                                    # B4a: without the stored kind, recipe-ingredient-on-rule refuses the card line (an ingredient on a rule) too
                                    # and the pack-double refusal is still answered 22023; the first case to differ is the one that saves it.
                                    _PK + 'active_owner / recipe_with_kinds_ok / '),
    'text_recipe_noop_sees_the_kind': ('write_recipe', 'text', ("|| case when i.kind = 'packaging' then jsonb_build_object('kind', 'packaging') else '{}'::jsonb end", "|| '{}'::jsonb"),
                                       _PKC + 'active_owner / recipe_same_again_made_no_version'),
    'text_cost_adds_the_packaging': ('get_recipe_costs', 'text', ('t.batch / r.yield_count + coalesce(t.pack, 0)', 't.batch / r.yield_count'),
                                     _PKC + 'active_owner / cost_per_cookie_adds_both'),
    'text_cost_packaging_alone_is_unknown': ('get_recipe_costs', 'text', ("'per_cookie_cents', round(t.batch / r.yield_count + coalesce(t.pack, 0), 4)", "'per_cookie_cents', round(coalesce(t.batch, 0) / r.yield_count + coalesce(t.pack, 0), 4)"),
                                             _PKC + 'active_owner / cost_packaging_alone_is_not_a_cookie_cost'),
    'text_cost_batch_is_ingredients': ('get_recipe_costs', 'text', ("sum(l.cents) filter (where l.kind = 'ingredient') as batch", 'sum(l.cents) as batch'),
                                       _PKC + 'active_owner / cost_batch_is_the_ingredients_only'),
    'text_cost_unknown_packaging_is_null': ('get_recipe_costs', 'text', ('case when t.pack_n = 0 then 0 else round(t.pack, 4) end', 'coalesce(round(t.pack, 4), 0)'),
                                            _PKC + 'active_owner / cost_unknown_packaging_is_null_not_zero'),
    'text_cost_incomplete_packaging': ('get_recipe_costs', 'text', ("'complete', t.ing_n > 0 and t.miss = 0", "'complete', t.ing_n > 0"),
                                       _PKC + 'active_owner / cost_packaging_without_a_cost_is_incomplete'),
    # B3b-2 (migration 61): get_books lists a pack and a bazaar sale that took nothing, with its why, beside the dough and batch lines.
    'text_books_uncosted_pack_arm': ('get_books', 'text', ("r.kind in ('dough', 'batch', 'pack', 'sale')", "r.kind in ('dough', 'batch', 'sale')"),
                                     _PKC + 'active_owner / books_pack_no_rule_is_uncosted'),
    'text_books_uncosted_sale_arm': ('get_books', 'text', ("r.kind in ('dough', 'batch', 'pack', 'sale')", "r.kind in ('dough', 'batch', 'pack')"),
                                     _PKC + 'active_owner / books_sale_no_rule_is_uncosted'),
    'text_books_uncosted_needs_a_why': ('get_books', 'text', ("(e.value ? 'why')", 'true'),
                                        _PKC + 'active_owner / books_pack_short_without_why_is_not_a_production_line'),
    'text_books_uncosted_made_upper_bound': ('get_books', 'text', ("(e.value ? 'why') and r.at >= p_from and r.at < p_to", "(e.value ? 'why') and r.at >= p_from and r.at <= p_to"),
                                             _PKC + 'active_owner / books_pack_and_sale_follow_the_period'),
    'text_books_uncosted_made_lower_bound': ('get_books', 'text', ("(e.value ? 'why') and r.at >= p_from", "(e.value ? 'why') and r.at > p_from"),
                                             _PKC + 'active_owner / books_pack_and_sale_follow_the_period'),
}
PACKAGING_TABLE_MUTATIONS = {
    'rules_table_select': ('grant select on public.packaging_rules to anon;', 'packaging outcome differs: anon / rules_select / '),
}


# E1: the owner's books (books.sql), acting on the last migration that defines each function.
_BK = 'books outcome differs: active_owner / '
_BKC = 'books check differs: active_owner / '
BOOKS_MUTATIONS = {
    'rule_exp_keys': ('record_expense', 'rule', 'exp-keys', _BK + 'exp_keys_missing / '),
    'rule_exp_id': ('record_expense', 'rule', 'exp-id', _BK + 'exp_id_bad / '),
    'rule_exp_text': ('record_expense', 'rule', 'exp-text', _BK + 'exp_category_blank / '),
    'rule_exp_amount': ('record_expense', 'rule', 'exp-amount', _BK + 'exp_amount_zero / '),
    'rule_exp_at': ('record_expense', 'rule', 'exp-at', _BK + 'exp_at_future / '),
    'rule_exp_replay_conflict': ('record_expense', 'rule', 'exp-replay-conflict', _BK + 'exp_replay_other_body / '),
    'rule_exp_reserved': ('record_expense', 'rule', 'exp-reserved', _BK + 'exp_reserved_category / '),
    'rule_draw_keys': ('record_draw', 'rule', 'draw-keys', _BK + 'draw_keys_missing / '),
    'rule_draw_id': ('record_draw', 'rule', 'draw-id', _BK + 'draw_id_bad / '),
    'rule_draw_amount': ('record_draw', 'rule', 'draw-amount', _BK + 'draw_amount_zero / '),
    'rule_draw_at': ('record_draw', 'rule', 'draw-at', _BK + 'draw_at_future / '),
    'rule_draw_replay_conflict': ('record_draw', 'rule', 'draw-replay-conflict', _BK + 'draw_replay_other_body / '),
    'text_draw_not_expense': ('get_books', 'text', ("l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and", "l.kind in ('cost', 'adjustment') and"),
                              _BKC + 'draw_is_not_an_expense'),
    'rule_cor_keys': ('record_cost_correction', 'rule', 'cor-keys', _BK + 'cor_keys_missing / '),
    'rule_cor_id': ('record_cost_correction', 'rule', 'cor-id', _BK + 'cor_id_bad / '),
    'rule_cor_cost': ('record_cost_correction', 'rule', 'cor-cost', _BK + 'cor_cost_negative / '),
    'rule_cor_at': ('record_cost_correction', 'rule', 'cor-at', _BK + 'cor_at_future / '),
    'rule_cor_replay_conflict': ('record_cost_correction', 'rule', 'cor-replay-conflict', _BK + 'cor_replay_other_body / '),
    'rule_cor_movement_missing': ('record_cost_correction', 'rule', 'cor-movement-missing', _BK + 'cor_movement_missing / '),
    'rule_cor_not_costed': ('record_cost_correction', 'rule', 'cor-not-costed', _BK + 'cor_not_a_costed_receipt / '),
    'rule_cor_no_change': ('record_cost_correction', 'rule', 'cor-no-change', _BK + 'cor_no_change / '),
    'rule_basis_value': ('set_cost_basis', 'rule', 'basis-value', _BK + 'basis_bad / '),
    'rule_books_period': ('get_books', 'rule', 'books-period', _BK + 'books_period_reversed / '),
    'text_bought_has_no_use_cost': ('get_books', 'text', ("where v_basis = 'used' and m.kind in ('use', 'waste')", "where m.kind in ('use', 'waste')"),
                                    _BKC + 'books_bought_expenses'),
    'text_last_paid_corrected': ('get_last_paid', 'text', ('public.receipt_cost(m.id) as cost_cents', 'm.cost_cents as cost_cents'),
                                 _BKC + 'last_paid_uses_the_corrected_cost'),
    'text_price_latest_receipt': ('get_books', 'text', ('round((-m.qty_delta + m.short_qty) * m.unit_cost)', 'round((-m.qty_delta + m.short_qty) * 10)'),
                                  _BKC + 'used_excludes_receipts_and_prices_use'),
    'text_correction_saved_order': ('receipt_cost', 'text', ('order by c.received_at desc, c.id desc limit 1', 'order by c.at desc, c.received_at desc limit 1'),
                                    _BKC + 'cor_latest_is_the_one_saved_last'),
    'text_period_exclusive': ('get_books', 'text', ('o.paid_at >= p_from and o.paid_at < p_to and o.paid_cents > 0', 'o.paid_at >= p_from and o.paid_at <= p_to and o.paid_cents > 0'),
                              _BKC + 'books_period_upper_bound_exclusive'),
    'text_stamp_paid': ('orders_books_stamp', 'text', ('if new.paid_cents is not null and old.paid_cents is null and new.paid_at is null then', 'if false then'),
                        _BKC + 'trigger_stamps_paid_at'),
    'text_stamp_refunded': ('orders_books_stamp', 'text', ("if new.pay_state = 'refunded' and old.pay_state is distinct from 'refunded' and new.refunded_at is null then", 'if false then'),
                            _BKC + 'trigger_stamps_refunded_at'),
    'text_correction_sign': ('record_cost_correction', 'text', ('v_now - v_cost::bigint,', 'v_cost::bigint - v_now,'),
                             _BKC + 'cor_lowers_the_cost_by_the_difference'),
}
BOOKS_TABLE_MUTATIONS = {
    'settings_table_select': ('grant select on public.books_settings to anon;', 'books outcome differs: anon / settings_select / '),
    # B4a (migration 62): a fresh database counts stock as it is bought until the cost cutover; the row and the column default say so.
    'basis_row_is_used': ("update public.books_settings set cost_basis = 'used' where id;", _BKC + 'books_default_basis_is_bought'),
    'basis_default_is_used': ("alter table public.books_settings alter column cost_basis set default 'used';", _BKC + 'books_column_default_is_bought'),
}
# B4a-1: the cost cutover (cutover.sql), acting on migration 62. The rule mutants neutralise one tagged refusal; the text mutants restate one
# line of the plan (the use arm starts at the cutover, the opening credit is a credit, a purchase before the cutover is still an expense).
# Each expected text is the first case of the suite that must then fail.
_CU = 'cutover outcome differs: '
_CUC = 'cutover check differs: '
COST_CUTOVER_MUTATIONS = {
    'rule_cutover_expected': ('apply_cost_cutover', 'rule', 'cutover-expected', _CU + 'operator / cutover_keys_null / '),
    'rule_cutover_once': ('apply_cost_cutover', 'rule', 'cutover-once', _CU + 'operator / cutover_once / '),
    'rule_cutover_changed': ('apply_cost_cutover', 'rule', 'cutover-changed', _CU + 'operator / cutover_changed_after_preview / '),
    'rule_basis_needs_cutover': ('set_cost_basis', 'rule', 'basis-needs-cutover', _CU + 'active_owner / basis_needs_cutover / '),
    'rule_recipe_ingredient_on_rule': ('write_recipe', 'rule', 'recipe-ingredient-on-rule', _CU + 'active_owner / recipe_ingredient_on_rule / '),
    # B4a-2: the unvalued refusal, the instant and the creation order the apply takes, and the side of each row (by order of writing, not date).
    'rule_cutover_unvalued': ('apply_cost_cutover', 'rule', 'cutover-unvalued', _CU + 'operator / cutover_unvalued_refused / '),
    'text_cutover_clock': ('apply_cost_cutover', 'text', ('v_at := clock_timestamp();', 'v_at := now();'), _CUC + 'operator / cutover_apply_sets_used'),
    'text_cutover_cut_seq': ('apply_cost_cutover', 'text', ('select coalesce(max(m.seq), 0) into v_cut_seq from public.stock_movements m;', 'select 0 into v_cut_seq;'),
                             _CUC + 'operator / cutover_apply_records_the_sequence'),
    'text_cutover_cut_corr_seq': ('apply_cost_cutover', 'text', ('select coalesce(max(c.seq), 0) into v_cut_cseq from public.stock_cost_corrections c;', 'select 0 into v_cut_cseq;'),
                                  _CUC + 'operator / cutover_apply_records_the_sequence'),
    'text_cutover_use_bound': ('get_books', 'text', ("and m.seq > v_cut_seq\n      union all\n      select 'c:'", "\n      union all\n      select 'c:'"),
                               _CUC + 'active_owner / books_before_cutover_is_bought'),
    'text_cutover_use_by_date': ('get_books', 'text', ("and m.seq > v_cut_seq\n      union all\n      select 'c:'", "and m.at >= v_cut\n      union all\n      select 'c:'"),
                                 _CUC + 'active_owner / late_use_before_cutover_date'),
    'text_cutover_correction_bound': ('get_books', 'text', (" and c.seq > v_cut_cseq\n      union all\n      select 'k:opening'", "\n      union all\n      select 'k:opening'"),
                                      _CUC + 'active_owner / books_before_cutover_is_bought'),
    'text_cutover_correction_by_date': ('get_books', 'text', (" and c.seq > v_cut_cseq\n      union all\n      select 'k:opening'", " and c.at >= v_cut\n      union all\n      select 'k:opening'"),
                                        _CUC + 'active_owner / late_correction_counted_once'),
    'text_cutover_opening_sign': ('get_books', 'text', ('-k.total_cents', 'k.total_cents'), _CUC + 'active_owner / books_opening_credit_once'),
    'text_cutover_receipt_side': ('get_books', 'text', ('then not exists (select 1 from public.stock_movements m where m.ledger_id = l.id and m.seq > v_cut_seq)', 'then false'),
                                  _CUC + 'active_owner / books_before_cutover_is_bought'),
    'text_cutover_receipt_by_date': ('get_books', 'text', ('where m.ledger_id = l.id and m.seq > v_cut_seq)', 'where m.ledger_id = l.id and m.at >= v_cut)'),
                                     _CUC + 'active_owner / late_delivery_after_cutover'),
    'text_cutover_correction_line_side': ('get_books', 'text', ('then not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id and c.seq > v_cut_cseq)', 'then true'),
                                          _CUC + 'active_owner / late_correction_counted_once'),
    'text_cutover_correction_line_by_date': ('get_books', 'text', ('where c.ledger_id = l.id and c.seq > v_cut_cseq)', 'where c.ledger_id = l.id and c.at >= v_cut)'),
                                             _CUC + 'active_owner / late_correction_counted_once'),
    'text_cutover_uncosted_bound': ('get_books', 'text', ("and m.seq > v_cut_seq\n      union all\n      select 'p:'", "\n      union all\n      select 'p:'"),
                                    _CUC + 'active_owner / books_uncosted_only_after_cutover'),
    'text_cutover_uncosted_by_date': ('get_books', 'text', ("and m.seq > v_cut_seq\n      union all\n      select 'p:'", "and m.at >= v_cut\n      union all\n      select 'p:'"),
                                      _CUC + 'active_owner / late_uncosted_use_is_listed'),
    'text_cutover_production_bound': ('get_books', 'text', (' and r.at < p_to and r.at >= v_cut', ' and r.at < p_to'), _CUC + 'active_owner / books_uncosted_only_after_cutover'),
    # B4a-4 (migration 64): an opening quantity is refused after the cutover, a cutover cleared by hand is read as the bought basis, and the preview
    # lists the active items that have never had a movement (listed, counted and in the hash).
    'rule_mv_opening_after_cutover': ('record_stock_movement', 'rule', 'mv-opening-after-cutover', _CU + 'active_owner / opening_after_cutover / '),
    'text_cutover_null_cut_is_bought': ('get_books', 'text', ("  if v_cut is null then v_basis := 'bought'; end if;\n", ''),
                                        _CUC + 'active_owner / books_hand_cleared_cutover_is_bought'),
    'text_cutover_not_counted_hash': ('preview_cost_cutover', 'text', ('v_items::text || v_notcounted::text ||', 'v_items::text ||'),
                                      _CUC + 'operator / cutover_hash_follows_not_counted'),
    'text_cutover_not_counted_active': ('preview_cost_cutover', 'text', ('where i.active and not exists', 'where not exists'),
                                        _CUC + 'operator / cutover_preview_counts_and_hash'),
    'text_cutover_not_counted_movement': ('preview_cost_cutover', 'text', (" and not exists (select 1 from public.stock_movements m where m.item_id = i.id and m.kind in ('opening', 'receipt', 'count', 'adjust'))", ''),
                                          _CUC + 'operator / cutover_preview_counts_and_hash'),
    'text_cutover_not_counted_kind': ('preview_cost_cutover', 'text', (" and m.kind in ('opening', 'receipt', 'count', 'adjust'))", ')'),
                                      _CUC + 'operator / cutover_preview_counts_and_hash'),
    'text_cutover_not_counted_count': ('preview_cost_cutover', 'text', ("'unvalued', v_n - v_valued, 'not_counted', v_nc_n)", "'unvalued', v_n - v_valued, 'not_counted', 0)"),
                                       _CUC + 'operator / cutover_preview_counts_and_hash'),
    'text_cutover_not_counted_listed': ('preview_cost_cutover', 'text', ("'not_counted', v_notcounted,", "'not_counted', '[]'::jsonb,"),
                                        _CUC + 'operator / cutover_preview_lists_not_counted'),
    # B4b-1 (migration 65): after the cutover a count that finds less, and a negative adjustment, are stamped with the cost known when they are written
    # and booked as an expense of the change x that cost, by order of writing; none known is listed as uncosted; more, the same and an adjustment up book nothing.
    'text_count_stamp_off': ('record_stock_movement', 'text', ("if v_kind in ('count', 'adjust') and v_delta < 0 then", 'if false then'),
                             _CUC + 'active_owner / b4b1_count_down_is_stamped'),
    'text_count_stamp_count_only': ('record_stock_movement', 'text', ("if v_kind in ('count', 'adjust') and v_delta < 0 then", "if v_kind = 'count' and v_delta < 0 then"),
                                    _CUC + 'active_owner / b4b1_count_down_is_stamped'),
    'text_count_stamp_adjust_only': ('record_stock_movement', 'text', ("if v_kind in ('count', 'adjust') and v_delta < 0 then", "if v_kind = 'adjust' and v_delta < 0 then"),
                                     _CUC + 'active_owner / b4b1_count_down_is_stamped'),
    'text_count_stamp_the_same': ('record_stock_movement', 'text', ("if v_kind in ('count', 'adjust') and v_delta < 0 then", "if v_kind in ('count', 'adjust') and v_delta <= 0 then"),
                                  _CUC + 'active_owner / b4b1_count_up_same_adjust_up_not_stamped'),
    'text_count_stamp_the_raise': ('record_stock_movement', 'text', ("if v_kind in ('count', 'adjust') and v_delta < 0 then", "if v_kind in ('count', 'adjust') and v_delta <> 0 then"),
                                   _CUC + 'active_owner / b4b1_count_up_same_adjust_up_not_stamped'),
    'text_count_line_off': ('get_books', 'text', ("m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is not null", 'false'),
                            _CUC + 'active_owner / b4b1_count_down_is_an_expense'),
    'text_count_line_sign': ('get_books', 'text', ('round(-m.qty_delta * m.unit_cost)::bigint, m.at, 0', 'round(m.qty_delta * m.unit_cost)::bigint, m.at, 0'),
                             _CUC + 'active_owner / b4b1_count_down_is_an_expense'),
    'text_count_line_label': ('get_books', 'text', ("(case m.kind when 'count' then 'Count: ' else 'Adjustment: ' end)", "'Count: '"),
                              _CUC + 'active_owner / b4b1_adjust_down_is_an_expense'),
    'text_count_line_raise': ('get_books', 'text', ("m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is not null", "m.kind in ('count', 'adjust') and m.unit_cost is not null"),
                              _CUC + 'active_owner / b4b1_stamped_count_up_books_nothing'),
    'text_count_line_basis': ('get_books', 'text', ("where v_basis = 'used' and m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is not null",
                                                    "where m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is not null"),
                              _CUC + 'active_owner / b4b1_bought_basis_books_no_count'),
    'text_count_line_bound': ("get_books", 'text', ("m.unit_cost is not null and m.at >= p_from and m.at < p_to\n         and m.seq > v_cut_seq\n      union all\n      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use'",
                                                    "m.unit_cost is not null and m.at >= p_from and m.at < p_to\n      union all\n      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use'"),
                              _CUC + 'active_owner / b4b1_count_before_cutover_books_nothing'),
    'text_count_line_by_date': ('get_books', 'text', ("m.unit_cost is not null and m.at >= p_from and m.at < p_to\n         and m.seq > v_cut_seq\n      union all\n      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use'",
                                                      "m.unit_cost is not null and m.at >= p_from and m.at < p_to\n         and m.at >= v_cut\n      union all\n      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use'"),
                               _CUC + 'active_owner / b4b1_count_dated_before_cutover_is_written_after'),
    'text_count_uncosted_off': ('get_books', 'text', ("m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null", 'false'),
                                _CUC + 'active_owner / b4b1_count_down_no_cost_is_listed'),
    'text_count_uncosted_costed': ('get_books', 'text', ("m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null", "m.kind in ('count', 'adjust') and m.qty_delta < 0"),
                                   _CUC + 'active_owner / b4b1_costed_movements_are_not_uncosted'),
    'text_count_uncosted_raise': ('get_books', 'text', ("m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null", "m.kind in ('count', 'adjust') and m.unit_cost is null"),
                                  _CUC + 'active_owner / b4b1_count_up_same_adjust_up_book_nothing'),
    'text_count_uncosted_kind': ('get_books', 'text', ("select 'm:' || m.id::text, m.kind, i.name, -m.qty_delta", "select 'm:' || m.id::text, 'count', i.name, -m.qty_delta"),
                                 _CUC + 'active_owner / b4b1_adjust_down_no_cost_is_listed'),
    'text_count_uncosted_qty': ('get_books', 'text', ("m.kind, i.name, -m.qty_delta, i.unit", "m.kind, i.name, m.qty_delta, i.unit"),
                                _CUC + 'active_owner / b4b1_count_down_no_cost_is_listed'),
    'text_count_uncosted_basis': ('get_books', 'text', ("m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to\n         and m.seq > v_cut_seq\n", "m.unit_cost is null and m.at >= p_from and m.at < p_to\n         and m.seq > v_cut_seq\n"),
                                 _CUC + 'active_owner / b4b1_bought_basis_books_no_count'),
    'text_count_uncosted_bound': ('get_books', 'text', ("where m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to\n         and m.seq > v_cut_seq",
                                                       "where m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to"),
                                  _CUC + 'active_owner / b4b1_count_before_cutover_is_not_uncosted'),
    'text_count_uncosted_by_date': ('get_books', 'text', ("m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to\n         and m.seq > v_cut_seq\n", "m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to\n         and m.at >= v_cut\n"),
                                    _CUC + 'active_owner / b4b1_late_dated_no_cost_count_is_listed'),
}
COST_CUTOVER_TABLE_MUTATIONS = {
    'cutover_table_select': ('grant select on public.cost_cutover to anon;', _CU + 'anon / cutover_select / '),
}
# B3a: the cost core (item-costs.sql), acting on the last migration that defines each function. The money cases are worked by hand in the suite.
_CS = 'item cost outcome differs: active_owner / '
_CSC = 'item cost check differs: active_owner / '
# B4a-3: her-data imports (imports.sql), acting on migration 63. The rule mutants neutralise one tagged refusal of a run_ or apply_ function; the text
# mutants restate one line (the category default, the rule an import removes, the rollback of a preview, the hash). The writers under them keep their
# own rules, which the earlier suites mutate (the write_ names above).
_IMO = 'import outcome differs: operator / '
_IMC = 'import check differs: operator / '
IMPORT_MUTATIONS = {
    'rule_import_items_rows': ('run_import_items', 'rule', 'import-items-rows', _IMO + 'imp_items_rows_empty_list / '),
    'rule_import_items_row': ('run_import_items', 'rule', 'import-items-row', _IMC + 'imp_items_preview_counts'),
    'rule_import_items_unit': ('run_import_items', 'rule', 'import-items-unit', _IMC + 'imp_items_preview_counts'),
    'rule_import_items_ambiguous': ('run_import_items', 'rule', 'import-items-ambiguous', _IMC + 'imp_items_why_several'),
    'rule_import_items_unit_differs': ('run_import_items', 'rule', 'import-items-unit-differs', _IMC + 'imp_items_preview_counts'),
    'rule_import_items_expected': ('apply_import_items', 'rule', 'import-items-expected', _IMO + 'imp_items_expected_null / '),
    'rule_import_items_changed': ('apply_import_items', 'rule', 'import-items-changed', _IMO + 'imp_items_stale_hash / '),
    'rule_import_prices_rows': ('run_import_prices', 'rule', 'import-prices-rows', _IMO + 'imp_prices_rows_empty_list / '),
    'rule_import_prices_row': ('run_import_prices', 'rule', 'import-prices-row', _IMC + 'imp_prices_why_row_keys'),
    'rule_import_prices_item_none': ('run_import_prices', 'rule', 'import-prices-item-none', _IMC + 'imp_prices_why_none'),
    'rule_import_prices_item_several': ('run_import_prices', 'rule', 'import-prices-item-several', _IMC + 'imp_prices_preview_counts'),
    'rule_import_prices_unit': ('run_import_prices', 'rule', 'import-prices-unit', _IMC + 'imp_prices_preview_counts'),
    'rule_import_prices_expected': ('apply_import_prices', 'rule', 'import-prices-expected', _IMO + 'imp_prices_expected_null / '),
    'rule_import_prices_changed': ('apply_import_prices', 'rule', 'import-prices-changed', _IMO + 'imp_prices_stale_hash / '),
    'rule_import_recipes_rows': ('run_import_recipes', 'rule', 'import-recipes-rows', _IMO + 'imp_recipes_rows_empty_list / '),
    'rule_import_recipes_row': ('run_import_recipes', 'rule', 'import-recipes-row', _IMC + 'imp_recipes_preview_counts'),
    'rule_import_recipes_product_none': ('run_import_recipes', 'rule', 'import-recipes-product-none', _IMC + 'imp_recipes_why_product_none'),
    'rule_import_recipes_product_several': ('run_import_recipes', 'rule', 'import-recipes-product-several', _IMC + 'imp_recipes_preview_counts'),
    'rule_import_recipes_line_none': ('run_import_recipes', 'rule', 'import-recipes-line-none', _IMC + 'imp_recipes_one_bad_line_holds_the_recipe'),
    'rule_import_recipes_line_several': ('run_import_recipes', 'rule', 'import-recipes-line-several', _IMC + 'imp_recipes_why_line_several'),
    'rule_import_recipes_line_unit': ('run_import_recipes', 'rule', 'import-recipes-line-unit', _IMC + 'imp_recipes_why_line_unit'),
    'rule_import_recipes_held': ('run_import_recipes', 'rule', 'import-recipes-held', _IMC + 'imp_recipes_one_bad_line_holds_the_recipe'),
    'rule_import_recipes_expected': ('apply_import_recipes', 'rule', 'import-recipes-expected', _IMO + 'imp_recipes_expected_null / '),
    'rule_import_recipes_changed': ('apply_import_recipes', 'rule', 'import-recipes-changed', _IMO + 'imp_recipes_stale_hash / '),
    'rule_import_flavours_rows': ('run_import_flavours', 'rule', 'import-flavours-rows', _IMO + 'imp_flavours_rows_empty_list / '),
    'rule_import_flavours_row': ('run_import_flavours', 'rule', 'import-flavours-row', _IMC + 'imp_flavours_why_row_keys'),
    'rule_import_flavours_product_none': ('run_import_flavours', 'rule', 'import-flavours-product-none', _IMC + 'imp_flavours_why_none'),
    'rule_import_flavours_product_several': ('run_import_flavours', 'rule', 'import-flavours-product-several', _IMC + 'imp_flavours_preview_counts'),
    'rule_import_flavours_expected': ('apply_import_flavours', 'rule', 'import-flavours-expected', _IMO + 'imp_flavours_expected_null / '),
    'rule_import_flavours_changed': ('apply_import_flavours', 'rule', 'import-flavours-changed', _IMO + 'imp_flavours_stale_hash / '),
    'rule_import_bookings_rows': ('run_import_bookings', 'rule', 'import-bookings-rows', _IMO + 'imp_bookings_rows_empty_list / '),
    'rule_import_bookings_row': ('run_import_bookings', 'rule', 'import-bookings-row', _IMC + 'imp_bookings_why_row_keys'),
    'rule_import_bookings_several': ('run_import_bookings', 'rule', 'import-bookings-several', _IMC + 'imp_bookings_preview_counts'),
    'rule_import_bookings_expected': ('apply_import_bookings', 'rule', 'import-bookings-expected', _IMO + 'imp_bookings_expected_null / '),
    'rule_import_bookings_changed': ('apply_import_bookings', 'rule', 'import-bookings-changed', _IMO + 'imp_bookings_stale_hash / '),
    'text_import_items_category_default': ('run_import_items', 'text', ("v_cat := coalesce(v_row ->> 'category', 'Ingredients');", "v_cat := coalesce(v_row ->> 'category', 'Packaging');"),
                                           _IMC + 'imp_items_will_write_names'),
    'text_import_prices_latest_pack': ('run_import_prices', 'text', ('or (v_last.id is not null and v_last.price_cents = v_cents and v_last.pack_size = v_pack);',
                                                                     'or (v_last.id is not null and v_last.price_cents = v_cents);'), _IMC + 'imp_prices_other_pack_is_a_change'),
    'text_import_recipes_removes_only_per_cookie': ('run_import_recipes', 'text', ("where r.item_id = any (v_pack_ids) and (r.per = 'cookie' or r.container = 'loose')\n                    order by r.container",
                                                                                   "where r.item_id = any (v_pack_ids)\n                    order by r.container"),
                                                    _IMC + 'imp_recipes_audit_rows'),
    'text_import_recipes_removes_first': ('run_import_recipes', 'text', ("perform public.write_packaging_rule(jsonb_build_object('container', v_c.container, 'box_size', v_c.box_size, 'lines', v_keep));", 'null;'),
                                          _IMC + 'imp_recipes_preview_counts'),
    'text_import_recipes_unchanged_removes_nothing': ('run_import_recipes', 'text', ('if v_res.version is not distinct from v_before then', 'if false then'),
                                                      _IMC + 'imp_recipes_preview_counts'),
    'text_import_flavours_keeps_the_stamp': ('run_import_flavours', 'text', ("'tag', v_p.tag), v_p.updated_at);", "'tag', v_p.tag), null);"), _IMC + 'imp_flavours_preview_counts'),
    'text_import_hash_is_of_will_write': ('import_result', 'text', ("'hash', encode(sha256(convert_to(v_write::text, 'UTF8')), 'hex'));", "'hash', encode(sha256(convert_to(v_same::text, 'UTF8')), 'hex'));"),
                                          _IMC + 'imp_items_hash_is_of_will_write'),
    'text_import_apply_audits_only_a_write': ('apply_import_items', 'text', ("if (v_res -> 'counts' ->> 'will_write')::integer > 0 then", 'if true then'),
                                              _IMC + 'imp_items_reapply_writes_nothing'),
    'text_import_preview_items_keeps_its_work': ('preview_import_items', 'text', ("raise exception '%', v_out::text using errcode = 'P0099';", 'return v_out;'),
                                                 _IMC + 'imp_items_preview_writes_nothing'),
    # Review fixes (migration 63): an invisible space or a name not in composed form, two prices for one item on one day, one flavour twice in a
    # recipes call, the fields an unchanged entry hides, and the will_write list in the audit row.
    'rule_import_items_invisible': ('run_import_items', 'rule', 'import-items-invisible', _IMC + 'imp_items_invisible_names_are_listed'),
    'rule_import_prices_invisible': ('run_import_prices', 'rule', 'import-prices-invisible', _IMC + 'imp_prices_invisible_name_is_listed'),
    'rule_import_prices_same_day': ('run_import_prices', 'rule', 'import-prices-same-day', _IMC + 'imp_prices_same_day_other_price'),
    'rule_import_recipes_product_invisible': ('run_import_recipes', 'rule', 'import-recipes-product-invisible', _IMC + 'imp_recipes_invisible_flavour_is_listed'),
    'rule_import_recipes_line_invisible': ('run_import_recipes', 'rule', 'import-recipes-line-invisible', _IMC + 'imp_recipes_invisible_line_item_holds_the_recipe'),
    'rule_import_recipes_flavour_twice': ('run_import_recipes', 'rule', 'import-recipes-flavour-twice', _IMC + 'imp_recipes_flavour_twice'),
    'rule_import_flavours_invisible': ('run_import_flavours', 'rule', 'import-flavours-invisible', _IMC + 'imp_flavours_invisible_name_is_listed'),
    'rule_import_bookings_invisible': ('run_import_bookings', 'rule', 'import-bookings-invisible', _IMC + 'imp_bookings_invisible_name_is_listed'),
    'text_import_name_ok_hidden_characters': ('import_name_ok', 'text', ('\\u00ad\\u034f\\u115f\\u1160\\u1680\\u180e', ''), _IMC + 'imp_items_more_invisible_characters'),
    'text_import_items_unchanged_category': ('run_import_items', 'text', (", 'unit', v_item.unit, 'category', v_item.category));", ", 'unit', v_item.unit));"),
                                             _IMC + 'imp_items_unchanged_shows_category'),
    'text_import_bookings_unchanged_fields': ('run_import_bookings', 'text', (",\n          'place', v_old.place, 'rent_cents', v_old.rent_cents, 'active', v_old.active));", "));"),
                                               _IMC + 'imp_bookings_unchanged_shows_what_it_keeps'),
    'text_import_items_audit_will_write': ('apply_import_items', 'text', (", 'will_write', v_res -> 'will_write'", ''), _IMC + 'imp_items_one_audit_row'),
    'text_import_prices_audit_will_write': ('apply_import_prices', 'text', (", 'will_write', v_res -> 'will_write'", ''), _IMC + 'imp_prices_one_audit_row'),
    'text_import_recipes_audit_will_write': ('apply_import_recipes', 'text', (", 'will_write', v_res -> 'will_write'", ''), _IMC + 'imp_recipes_audit_rows'),
    'text_import_flavours_audit_will_write': ('apply_import_flavours', 'text', (", 'will_write', v_res -> 'will_write'", ''), _IMC + 'imp_flavours_one_audit_row'),
    'text_import_bookings_audit_will_write': ('apply_import_bookings', 'text', (", 'will_write', v_res -> 'will_write'", ''), _IMC + 'imp_bookings_one_audit_row'),
    'text_import_preview_recipes_keeps_its_work': ('preview_import_recipes', 'text', ("raise exception '%', v_out::text using errcode = 'P0099';", 'return v_out;'),
                                                   _IMC + 'imp_recipes_preview_writes_nothing'),
}
IMPORT_ACL = ('preview_import_items(jsonb)', 'apply_import_items(jsonb,jsonb)', 'preview_import_prices(jsonb)', 'apply_import_prices(jsonb,jsonb)',
              'preview_import_recipes(jsonb)', 'apply_import_recipes(jsonb,jsonb)', 'preview_import_flavours(jsonb)', 'apply_import_flavours(jsonb,jsonb)',
              'preview_import_bookings(jsonb)', 'apply_import_bookings(jsonb,jsonb)',
              'run_import_items(jsonb)', 'run_import_prices(jsonb)', 'run_import_recipes(jsonb)', 'run_import_flavours(jsonb)', 'run_import_bookings(jsonb)',
              'write_stock_item(jsonb,timestamptz)', 'write_item_price(jsonb)', 'write_recipe(jsonb,timestamptz)', 'write_flavour(text,jsonb,timestamptz)',
              'write_scheduled_event(jsonb,timestamptz)', 'import_result(jsonb,jsonb,jsonb,jsonb)', 'import_expected_ok(jsonb,text[])', 'import_keys_ok(jsonb,text[],text[])', 'import_name_ok(text)')
COST_MUTATIONS = {
    'rule_itemprice_keys': ('write_item_price', 'rule', 'itemprice-keys', _CS + 'ip_keys_missing / '),
    'rule_itemprice_id': ('write_item_price', 'rule', 'itemprice-id', _CS + 'ip_id_bad / '),
    'rule_itemprice_cents': ('write_item_price', 'rule', 'itemprice-cents', _CS + 'ip_cents_zero / '),
    'rule_itemprice_pack': ('write_item_price', 'rule', 'itemprice-pack', _CS + 'ip_pack_zero / '),
    'rule_itemprice_date': ('write_item_price', 'rule', 'itemprice-date', _CS + 'ip_date_format / '),
    'rule_itemprice_future': ('write_item_price', 'rule', 'itemprice-future', _CS + 'ip_date_future / '),
    'rule_itemprice_replay_conflict': ('write_item_price', 'rule', 'itemprice-replay-conflict', _CS + 'ip_replay_other_body / '),
    'rule_itemprice_item_missing': ('write_item_price', 'rule', 'itemprice-item-missing', _CS + 'ip_item_missing / '),
    'text_cost_average_formula': ('record_stock_movement', 'text',
                                  ('v_avg := (v_item.on_hand * v_base + v_cost) / (v_item.on_hand + v_qty);', 'v_avg := v_cost / v_qty;'),
                                  _CSC + 'cost_a_stamps'),
    'text_cost_average_first': ('item_unit_cost', 'text', ("'average'::text as src, 1 as ord", "'average'::text as src, 4 as ord"),
                                _CSC + 'cost_order_average_first'),
    'text_cost_usual_before_supplier': ('item_unit_cost', 'text', ("'usual'::text, 2", "'usual'::text, 4"),
                                        _CSC + 'cost_order_usual_before_supplier'),
    'text_cost_correction_share': ('record_cost_correction', 'text', ('v_f := least(1, greatest(0, v_f * v_h_after / v_h_before));', 'v_f := v_f;'),
                                   _CSC + 'cost_d_average_and_used'),
    'text_cost_used_line_counts_the_short': ('get_books', 'text',
                                             ('round((-m.qty_delta + m.short_qty) * m.unit_cost)', 'round(-m.qty_delta * m.unit_cost)'),
                                             _CSC + 'cost_c_line'),
    'text_cost_correction_counts_only_use_waste': ('record_cost_correction', 'text',
                                                   ('if v_mv.qty_delta < 0 then', "if v_mv.kind in ('use', 'waste') and v_mv.qty_delta < 0 then"),
                                                   _CSC + 'cost_g1_count_scales_the_share'),
    'text_cost_correction_f_starts_at_one': ('record_cost_correction', 'text', ('v_f numeric := 1;', 'v_f numeric := 0;'),
                                             _CSC + 'cost_d_average_and_used'),
    'text_cost_correction_applied_order': ('record_cost_correction', 'text',
                                           ('m.seq > v_m.seq order by m.seq desc', 'm.at > v_m.at order by m.at desc'),
                                           _CSC + 'cost_h5_applied_order_not_dated_order'),
    'text_cost_correction_drops_a_dead_average': ('record_cost_correction', 'text', ('if v_new_avg > 0 then', 'if true then'),
                                                  _CS + 'h1_correct / 23514'),
    'text_cost_correction_nothing_on_hand': ('record_cost_correction', 'text',
                                             ('v_stock.on_hand > 0 and v_stock.avg_cost is not null', 'v_stock.avg_cost is not null'),
                                             _CS + 'h2_correct / 22012'),
    'text_cost_correction_no_average': ('record_cost_correction', 'text',
                                        ('v_stock.on_hand > 0 and v_stock.avg_cost is not null', 'v_stock.on_hand > 0'),
                                        _CSC + 'cost_h3_no_average_all_used'),
    'text_cost_uncosted_production_arm': ('get_books', 'text', ("(e.value ? 'why')", 'false'),
                                          _CSC + 'cost_u_uncosted_lists_the_lines_not_taken'),
    'text_cost_waste_is_stamped': ('record_stock_movement', 'text',
                                   ("if v_kind = 'waste' then\n    select c.unit_cost, c.source into v_ucost, v_usrc",
                                    "if false then\n    select c.unit_cost, c.source into v_ucost, v_usrc"),
                                   _CSC + 'cost_e_stamps'),
    'text_cost_base_falls_back_to_usual': ('record_stock_movement', 'text', ('if v_base is null and v_item.on_hand > 0 then', 'if false then'),
                                           _CSC + 'cost_b4_first_costed_delivery'),
    'text_cost_uncosted_is_not_a_line': ('get_books', 'text',
                                         ("where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null and m.at >= p_from",
                                          "where v_basis = 'used' and m.kind in ('use', 'waste') and m.at >= p_from"),
                                         _CSC + 'cost_b3_is_never_a_line'),
}
# B3a: batch corrections (batch-correction.sql), acting on the last migration that defines each function. The money cases are worked by
# hand in the suite. Not mutation-tested (one session cannot observe a lock): the two advisory locks of record_batch_correction.
_BCO = 'correction outcome differs: active_owner / '
_BCC = 'correction check differs: active_owner / '
_BCB = 'record_batch_correction'
BATCH_CORRECTION_MUTATIONS = {
    'rule_corr_keys': (_BCB, 'rule', 'corr-keys', _BCO + 'corr_keys_extra / '),
    'rule_corr_id': (_BCB, 'rule', 'corr-id', _BCO + 'corr_id_bad / '),
    'rule_corr_qty': (_BCB, 'rule', 'corr-qty', _BCO + 'corr_qty_over / '),
    'rule_corr_rejects': (_BCB, 'rule', 'corr-rejects', _BCO + 'corr_rejects_over / '),
    'rule_corr_reason': (_BCB, 'rule', 'corr-reason', _BCO + 'corr_reason_blank / '),
    'rule_corr_at': (_BCB, 'rule', 'corr-at', _BCO + 'corr_at_future / '),
    'rule_corr_replay_conflict': (_BCB, 'rule', 'corr-replay-conflict', _BCO + 'corr_replay_other_body / '),
    'rule_corr_batch_missing': (_BCB, 'rule', 'corr-batch-missing', _BCO + 'corr_batch_missing / '),
    'rule_corr_no_change': (_BCB, 'rule', 'corr-no-change', _BCO + 'corr_no_change / '),
    'rule_corr_baked_negative': (_BCB, 'rule', 'corr-baked-negative', _BCO + 'corr_down_below_packed / '),
    'text_corr_delta_from_effective': (_BCB, 'text',
        ('select v_batch.qty + coalesce(sum(c.qty_delta), 0), v_batch.rejects + coalesce(sum(c.rejects_delta), 0) into v_eff_q, v_eff_r',
         'select v_batch.qty + 0 * coalesce(sum(c.qty_delta), 0), v_batch.rejects + 0 * coalesce(sum(c.rejects_delta), 0) into v_eff_q, v_eff_r'),
        _BCC + 'corr_down_effective'),
    'text_corr_opposite_entry': (_BCB, 'text', ('v_batch.id, v_qty::integer - v_eff_q, v_rej::integer - v_eff_r);', 'v_batch.id, v_eff_q - v_qty::integer, v_rej::integer - v_eff_r);'),
        _BCC + 'corr_up_writes_one_row'),
    'text_corr_copies_the_drop': (_BCB, 'text', ('v_batch.recipe_version, v_batch.drop_no, v_at,', 'v_batch.recipe_version, 0, v_at,'),
        _BCC + 'corr_up_writes_one_row'),
    'text_corr_audit_row': (_BCB, 'text', ("'production.batch_correction', 'production_records'", "'production.batch_corrected', 'production_records'"),
        _BCC + 'corr_up_one_audit_row'),
    'text_corr_replay_returns_effective': (_BCB, 'text',
        ('select b.qty + coalesce(sum(c.qty_delta), 0)::integer, b.rejects + coalesce(sum(c.rejects_delta), 0)::integer into v_eff_q, v_eff_r',
         'select b.qty + 0 * coalesce(sum(c.qty_delta), 0)::integer, b.rejects + 0 * coalesce(sum(c.rejects_delta), 0)::integer into v_eff_q, v_eff_r'),
        _BCC + 'corr_replay_is_duplicate'),
    'text_corr_balance_counts_packed': (_BCB, 'text',
        ('select -oi.qty from public.production_records r join public.order_items oi on oi.order_id = r.ref',
         'select 0 from public.production_records r join public.order_items oi on oi.order_id = r.ref'),
        _BCO + 'corr_down_below_packed / '),
    'text_corr_balance_counts_discards': (_BCB, 'text',
        ("where r.kind = 'discard_baked' and r.product_id = v_batch.product_id", "where r.kind = 'discard_baked' and false and r.product_id = v_batch.product_id"),
        _BCO + 'corr_down_below_discarded / '),
    'text_corr_balance_counts_corrections': (_BCB, 'text',
        ("where r.kind = 'batch_correction' and r.product_id = v_batch.product_id", "where r.kind = 'batch_correction' and false and r.product_id = v_batch.product_id"),
        _BCO + 'corr_down_below_discarded / '),
    'text_corr_up_never_refused': (_BCB, 'text',
        ('v_bad := v_qty < v_eff_q and v_have + (v_qty - v_eff_q) < 0;', 'v_bad := v_have + (v_qty - v_eff_q) < 0;'),
        _BCO + 'corr_up_when_negative_ok / '),
    'text_corr_effective_qty': ('get_production', 'text', ("'qty', b.qty + b.dq", "'qty', b.qty"), _BCC + 'corr_up_batch_list'),
    'text_corr_effective_rejects': ('get_production', 'text', ("'rejects', b.rejects + b.dr", "'rejects', b.rejects"), _BCC + 'corr_down_effective'),
    'text_corr_corrected_flag': ('get_production', 'text', ("'corrected', b.n_corr > 0", "'corrected', false"), _BCC + 'corr_up_batch_list'),
    'text_corr_baked_read': ('get_production', 'text', ('select r.product_id, r.qty_delta from', 'select r.product_id, 0 from'), _BCC + 'corr_baked_follows'),
    'text_corr_discard_balance': ('record_discard', 'text', ('select r.qty_delta from public.production_records r', 'select 0 from public.production_records r'),
        _BCO + 'corr_disc_after_down / '),
    'text_corr_per_cookie_effective': ('get_production', 'text', ('round(c.cost / (b.qty + b.dq), 4)', 'round(c.cost / b.qty, 4)'), _BCC + 'corr_up_cost'),
    'text_corr_per_cookie_zero': ('get_production', 'text', ('case when b.qty + b.dq > 0 then', 'case when true then'), 'division by zero'),
    'text_corr_cost_counts_the_short': ('get_production', 'text', ('(-m.qty_delta + m.short_qty) * m.unit_cost', '-m.qty_delta * m.unit_cost'),
        _BCC + 'corr_cost_counts_the_short'),
    'text_corr_cost_dough_counts_the_short': ('get_production', 'text', ('(m.short_qty - m.qty_delta) * m.unit_cost', '-m.qty_delta * m.unit_cost'),
        _BCC + 'corr_cost_dough_counts_the_short'),
    'text_corr_cost_adds_the_dough': ('get_production', 'text', ('own.cents + b.dough_used * case', 'own.cents + 0 * case'), _BCC + 'corr_d_cost_draws_dough'),
    'text_corr_cost_dough_precedes': ('get_production', 'text', ('d.at <= b.at) dough', 'true) dough'), _BCC + 'corr_cost_dough_after_batch'),
    'text_corr_cost_null_when_unknown': ('get_production', 'text',
        ('case when own.n_costed > 0 or (b.dough_used > 0 and dough.n_costed > 0) then', 'case when true then'), _BCC + 'corr_cost_dough_after_batch'),
    'text_corr_complete_unpriced': ('get_production', 'text', ('not own.unpriced and not own.why', 'not own.why'), _BCC + 'corr_cost_uncosted_movement'),
    'text_corr_complete_why': ('get_production', 'text', ('not own.unpriced and not own.why', 'not own.unpriced'), _BCC + 'corr_cost_line_not_a_stock_item'),
    'text_corr_complete_dough_why': ('get_production', 'text', ('not dough.unpriced and not dough.why', 'not dough.unpriced'), _BCC + 'corr_cost_dough_line_not_costed'),
    'text_corr_complete_dough_record': ('get_production', 'text', ('dough.n > 0 and dough.balls > 0 and ', ''), _BCC + 'corr_cost_dough_after_batch'),
    'text_corr_complete_legacy_short': ('get_production', 'text', ('jsonb_array_length(b.short) > count(*) filter (where m.short_qty > 0)', "exists (select 1 from jsonb_array_elements(b.short) e where e ? 'why')"), _BCC + 'corr_cost_legacy_short_not_complete'),
}
OPERATIONS_MUTATIONS = {
    'rule_ops_service': ('record_operations_run', 'rule', 'run-service', 'operations denial differs: record_anon / 00000'),
    'rule_ops_time': ('record_operations_run', 'rule', 'run-time', 'future run time accepted'),
    'rule_ops_input': ('record_operations_run', 'rule', 'run-input', 'nonbackup archive hash accepted'),
    'rule_ops_idempotency': ('record_operations_run', 'rule', 'run-idempotency', 'idempotency conflict differs: 00000'),
    'rule_ops_health_role': ('get_operations_health', 'rule', 'health-role', 'operations denial differs: health_helper / 00000'),
    'rule_ops_retention_service': ('prune_personal_data', 'rule', 'retention-service', 'operations denial differs: retention_helper / 00000'),
    'rule_ops_retention_window': ('prune_personal_data', 'rule', 'retention-window', 'short retention accepted'),
}


def order_mutant(name):
    """The migration's one function, changed in exactly one place, as SQL to run inside the suite."""
    function, kind, argument, _ = (ORDER_MUTATIONS | LOOKUP_MUTATIONS | STAFF_MUTATIONS | SHOP_MUTATIONS | EXTRAS_MUTATIONS | SCHEDULED_MUTATIONS | STOCK_MUTATIONS | RECIPE_MUTATIONS | LEDGER_MUTATIONS | PRODUCTION_MUTATIONS | BOOKS_MUTATIONS | OPERATIONS_MUTATIONS | IDENTITY_RULES | LINK_MUTATIONS | COST_MUTATIONS | BATCH_CORRECTION_MUTATIONS | PACKAGING_MUTATIONS | COST_CUTOVER_MUTATIONS | IMPORT_MUTATIONS | MOVEMENT_MUTATIONS | BAZAAR_DAY_MUTATIONS)[name]
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


# B2: shop identity and the business clock. The ACL mutants are the generic grant-to-anon ones; this
# one restores a raw table grant plus a policy, which the helper's table read must catch.
IDENTITY_MUTATIONS = {
    'identity_table_raw_write': ("grant select, insert, update, delete on public.shop_identity to authenticated; create policy \"leak\" on public.shop_identity for all to authenticated using (true) with check (true);",
                                 'forbidden identity call succeeded: active_helper / identity_table_select'),
}
# The tagged refusals of save_shop_identity. `identity-object` carries no tag: a null or non-object
# input would still be refused by the keys rule or by jsonb_object_keys, so no case could tell.
IDENTITY_RULES = {
    'rule_identity_owner': ('save_shop_identity', 'rule', 'identity-owner', 'forbidden identity call succeeded: active_helper / save_shop_identity'),
    'rule_identity_keys': ('save_shop_identity', 'rule', 'identity-keys', 'forbidden identity call succeeded: active_owner / identity_save_unknown_key'),
    'rule_identity_types': ('save_shop_identity', 'rule', 'identity-types', 'forbidden identity call succeeded: active_owner / identity_save_number'),
    'rule_identity_length': ('save_shop_identity', 'rule', 'identity-length', 'identity outcome differs: active_owner / identity_save_shop_name_long / 23514'),
    'rule_identity_control': ('save_shop_identity', 'rule', 'identity-control', 'identity outcome differs: active_owner / identity_save_control_tab / 23514'),
    'rule_identity_stale': ('save_shop_identity', 'rule', 'identity-stale', 'forbidden identity call succeeded: active_owner / identity_save_stale_without_row'),
}
IDENTITY_ROWS = 64
CLOCK_CASES = (ROOT / 'tests/fixtures/clock-cases.json').read_text(encoding='utf-8')
# B3a: every policy calls its helper wrapped. policies.sql compares the database with this list (the policies as they were
# before migration 58, helper calls bare); each mutant restates one policy and the suite must fail with its message.
POLICIES_BEFORE = (ROOT / 'tests/fixtures/policies-before-58.json').read_text(encoding='utf-8')
POLICY_MUTATIONS = {
    'policy_bare_owner': ("alter policy \"orders staff read\" on public.orders using (public.is_owner());",
                          'policy helper call is not wrapped: orders / orders staff read'),
    'policy_bare_uid': ("alter policy \"own profile\" on public.profiles using (id = auth.uid());",
                        'policy helper call is not wrapped: profiles / own profile'),
    'policy_bare_storage': ("alter policy \"shop media owner select\" on storage.objects using (bucket_id = 'shop-media' and public.is_owner());",
                            'policy helper call is not wrapped: objects / shop media owner select'),
    'policy_text_changed': ("alter policy \"orders staff read\" on public.orders using ((select public.is_owner()) or true);",
                            'policy text differs: orders / orders staff read'),
    'policy_added': ("create policy \"leak\" on public.settings for select using (true);",
                     'policy count differs'),
}
# B5-1: the owner's read of an item's movements (item-movements.sql), acting on migration 66. The rule mutants neutralise one tagged refusal; the text
# mutants restate one line (the owner check, each way the order or the limit could go wrong, a person column, a null cost turned into 0, a stamp or a
# paid total dropped, seconds for milliseconds).
_MVO = 'item movement outcome differs: '
_MVC = 'item movement check differs: '
_MVS = "order by m.seq desc\n       limit p_limit"
MOVEMENT_MUTATIONS = {
    'rule_movements_limit': ('get_item_movements', 'rule', 'movements-limit', _MVO + 'active_owner / movements_limit_zero / '),
    'rule_movements_item': ('get_item_movements', 'rule', 'movements-item', _MVO + 'active_owner / movements_item_unknown / '),
    'text_movements_owner': ('get_item_movements', 'text', ('if not public.is_owner() then', 'if false then'), _MVO + 'active_helper / movements_refused'),
    'text_movements_order_outer': ('get_item_movements', 'text', ('jsonb_agg(x.j order by x.seq desc)', 'jsonb_agg(x.j order by x.seq)'),
                                   _MVC + 'active_owner / movements_newest_first'),
    'text_movements_order_outer_by_date': ('get_item_movements', 'text', ('jsonb_agg(x.j order by x.seq desc)', "jsonb_agg(x.j order by (x.j ->> 'at')::bigint desc)"),
                                           _MVC + 'active_owner / movements_newest_first'),
    'text_movements_order_inner': ('get_item_movements', 'text', (_MVS, "order by m.seq\n       limit p_limit"),
                                   _MVC + 'active_owner / movements_limit_keeps_the_newest'),
    'text_movements_order_inner_by_date': ('get_item_movements', 'text', (_MVS, "order by m.at desc\n       limit p_limit"),
                                           _MVC + 'active_owner / movements_limit_keeps_the_newest'),
    'text_movements_limit_ignored': ('get_item_movements', 'text', ("\n       limit p_limit", ''),
                                     _MVC + 'active_owner / movements_limit_keeps_the_newest'),
    'text_movements_person': ('get_item_movements', 'text', ("'paid_cents', m.cost_cents,", "'paid_cents', m.cost_cents, 'created_by', m.created_by,"),
                              _MVC + 'active_owner / movements_row_keys'),
    'text_movements_stamp_dropped': ('get_item_movements', 'text', ("'unit_cost', round(m.unit_cost, 6)", "'unit_cost', null"),
                                     _MVC + 'active_owner / movements_stamped_cost_shows'),
    'text_movements_null_cost_zero': ('get_item_movements', 'text', ("'unit_cost', round(m.unit_cost, 6)", "'unit_cost', coalesce(round(m.unit_cost, 6), 0)"),
                                      _MVC + 'active_owner / movements_unknown_cost_stays_null'),
    'text_movements_paid_dropped': ('get_item_movements', 'text', ("'paid_cents', m.cost_cents", "'paid_cents', null"),
                                    _MVC + 'active_owner / movements_receipt_paid_and_supplier'),
    'text_movements_at_seconds': ('get_item_movements', 'text', ('* 1000)::bigint', '* 1)::bigint'),
                                  _MVC + 'active_owner / movements_at_is_epoch_milliseconds'),
}
# S1: bazaar days (bazaar-days.sql), acting on migration 68. The rule mutants neutralise one tagged line; the text mutants restate one line of
# the computation. Each expected text is the first case of the suite that must then fail. The figures are worked by hand in the suite's header.
_BZO = 'bazaar day outcome differs: active_owner / '
_BZC = 'bazaar day check differs: active_owner / '
BAZAAR_DAY_MUTATIONS = {
    'rule_bz_get_booking_missing': ('get_bazaar', 'rule', 'get-booking-missing', _BZO + 'get_booking_missing / '),
    'rule_bz_day_shape': ('save_bazaar_day', 'rule', 'day-shape', _BZO + 'day_shape_extra_key / '),
    'rule_bz_day_line_shape': ('save_bazaar_day', 'rule', 'day-line-shape', _BZO + 'day_line_extra_key / '),
    'rule_bz_day_line_values': ('save_bazaar_day', 'rule', 'day-line-values', _BZO + 'day_line_qty_too_big / '),
    'rule_bz_day_line_duplicate': ('save_bazaar_day', 'rule', 'day-line-duplicate', _BZO + 'day_line_twice / '),
    'rule_bz_day_booking_missing': ('save_bazaar_day', 'rule', 'day-booking-missing', _BZO + 'day_booking_missing / '),
    'rule_bz_day_replay': ('save_bazaar_day', 'rule', 'day-replay', _BZO + 'day_repeat_answered / '),
    'rule_bz_day_finalised': ('save_bazaar_day', 'rule', 'day-finalised', _BZO + 'day_plan_after_finalise / '),
    'rule_bz_day_started': ('save_bazaar_day', 'rule', 'day-started', _BZO + 'day_plan_after_start / '),
    'rule_bz_day_id_taken': ('save_bazaar_day', 'rule', 'day-id-taken', _BZO + 'day_id_of_another_booking / '),
    'rule_bz_day_outside': ('save_bazaar_day', 'rule', 'day-outside', _BZO + 'day_outside_the_booking / '),
    'rule_bz_day_flavour': ('save_bazaar_day', 'rule', 'day-flavour', _BZO + 'day_flavour_missing / '),
    'rule_bz_day_create_stamp': ('save_bazaar_day', 'rule', 'day-create-stamp', _BZO + 'day_create_with_a_stamp / '),
    'rule_bz_day_stale': ('save_bazaar_day', 'rule', 'day-stale', _BZO + 'day_create_again_other_body / '),
    'rule_bz_fee_shape': ('save_bazaar_fee', 'rule', 'fee-shape', _BZO + 'fee_shape_extra_key / '),
    'rule_bz_fee_client': ('save_bazaar_fee', 'rule', 'fee-client', _BZO + 'fee_rent_id / '),
    'rule_bz_fee_replay_conflict': ('save_bazaar_fee', 'rule', 'fee-replay-conflict', _BZO + 'fee_same_id_other_body / '),
    'rule_bz_fee_booking_missing': ('save_bazaar_fee', 'rule', 'fee-booking-missing', _BZO + 'fee_booking_missing / '),
    'rule_bz_fee_finalised': ('save_bazaar_fee', 'rule', 'fee-finalised', _BZO + 'fee_after_finalise / '),
    'rule_bz_fee_day': ('save_bazaar_fee', 'rule', 'fee-day', _BZO + 'fee_day_of_another_booking / '),
    'rule_bz_loss_shape': ('save_bazaar_loss', 'rule', 'loss-shape', _BZO + 'loss_shape_extra_key / '),
    'rule_bz_loss_at': ('save_bazaar_loss', 'rule', 'loss-at', _BZO + 'loss_in_the_future / '),
    'rule_bz_loss_day_missing': ('save_bazaar_loss', 'rule', 'loss-day-missing', _BZO + 'loss_day_missing / '),
    'rule_bz_loss_replay_conflict': ('save_bazaar_loss', 'rule', 'loss-replay-conflict', _BZO + 'loss_same_id_other_body / '),
    'rule_bz_loss_day_open': ('save_bazaar_loss', 'rule', 'loss-day-open', _BZO + 'loss_before_the_day_starts / '),
    'rule_bz_loss_flavour': ('save_bazaar_loss', 'rule', 'loss-flavour', _BZO + 'loss_flavour_not_on_the_day / '),
    'rule_bz_loss_below_zero': ('save_bazaar_loss', 'rule', 'loss-below-zero', _BZO + 'loss_below_zero / '),
    'rule_bz_cost_value': ('save_bazaar_cost', 'rule', 'cost-value', _BZO + 'cost_negative / '),
    'rule_bz_cost_booking_missing': ('save_bazaar_cost', 'rule', 'cost-booking-missing', _BZO + 'cost_booking_missing / '),
    'rule_bz_cost_flavour': ('save_bazaar_cost', 'rule', 'cost-flavour', _BZO + 'cost_flavour_missing / '),
    'rule_bz_cost_finalised': ('save_bazaar_cost', 'rule', 'cost-finalised', _BZO + 'cost_after_finalise / '),
    'rule_bz_target_value': ('save_bazaar_target', 'rule', 'target-value', _BZO + 'target_negative / '),
    'rule_bz_target_booking_missing': ('save_bazaar_target', 'rule', 'target-booking-missing', _BZO + 'target_booking_missing / '),
    'rule_bz_target_replay': ('save_bazaar_target', 'rule', 'target-replay', _BZO + 'target_repeat_after_finalise / '),
    'rule_bz_target_finalised': ('save_bazaar_target', 'rule', 'target-finalised', _BZO + 'target_after_finalise / '),
    'rule_bz_start_shape': ('start_bazaar_day', 'rule', 'start-shape', _BZO + 'day_start_bad_device / '),
    'rule_bz_start_day_missing': ('start_bazaar_day', 'rule', 'start-day-missing', _BZO + 'start_day_missing / '),
    'rule_bz_start_replay_conflict': ('start_bazaar_day', 'rule', 'start-replay-conflict', _BZO + 'start_again_other_event / '),
    'rule_bz_start_event_used': ('start_bazaar_day', 'rule', 'start-event-used', _BZO + 'start_event_id_used / '),
    'rule_bz_start_booking': ('start_bazaar_day', 'rule', 'start-booking', _BZO + 'start_booking_off / '),
    'rule_bz_start_finalised': ('start_bazaar_day', 'rule', 'start-finalised', _BZO + 'start_after_finalise / '),
    'rule_bz_start_other_open': ('start_bazaar_day', 'rule', 'start-other-open', _BZO + 'start_while_another_day_is_open / '),
    'rule_bz_start_empty': ('start_bazaar_day', 'rule', 'start-empty', _BZO + 'start_no_stock / '),
    'rule_bz_start_carry': ('start_bazaar_day', 'rule', 'start-carry', _BZO + 'start_carries_more_than_set_aside / '),
    'rule_bz_add_shape': ('add_bazaar_day_stock', 'rule', 'add-shape', _BZO + 'add_zero / '),
    'rule_bz_add_day_missing': ('add_bazaar_day_stock', 'rule', 'add-day-missing', _BZO + 'add_day_missing / '),
    'rule_bz_add_replay_conflict': ('add_bazaar_day_stock', 'rule', 'add-replay-conflict', _BZO + 'add_same_id_other_body / '),
    'rule_bz_add_day_open': ('add_bazaar_day_stock', 'rule', 'add-day-open', _BZO + 'add_before_the_day_starts / '),
    'rule_bz_add_flavour': ('add_bazaar_day_stock', 'rule', 'add-flavour', _BZO + 'add_flavour_without_a_price / '),
    'rule_bz_add_max': ('add_bazaar_day_stock', 'rule', 'add-max', _BZO + 'add_over_the_most / '),
    'rule_bz_add_carry': ('add_bazaar_day_stock', 'rule', 'add-carry', _BZO + 'add_carries_more_than_set_aside / '),
    'rule_bz_close_shape': ('close_bazaar_day', 'rule', 'close-shape', _BZO + 'close_shape_extra_key / '),
    'rule_bz_close_line_shape': ('close_bazaar_day', 'rule', 'close-line-shape', _BZO + 'close_line_extra_key / '),
    'rule_bz_close_day_missing': ('close_bazaar_day', 'rule', 'close-day-missing', _BZO + 'close_day_missing / '),
    'rule_bz_close_not_started': ('close_bazaar_day', 'rule', 'close-not-started', _BZO + 'close_before_the_day_starts / '),
    'rule_bz_close_replay_conflict': ('close_bazaar_day', 'rule', 'close-replay-conflict', _BZO + 'close_again_other_count / '),
    'rule_bz_close_at': ('close_bazaar_day', 'rule', 'close-at', _BZO + 'close_in_the_future / '),
    'rule_bz_close_stale': ('close_bazaar_day', 'rule', 'close-stale', _BZO + 'close_stale_hash / '),
    'rule_bz_close_lines': ('close_bazaar_day', 'rule', 'close-lines', _BZO + 'close_a_flavour_missing / '),
    'rule_bz_close_split': ('close_bazaar_day', 'rule', 'close-split', _BZO + 'close_split_does_not_add_up / '),
    'rule_bz_close_carry_last_day': ('close_bazaar_day', 'rule', 'close-carry-last-day', _BZO + 'close_carries_from_the_last_day / '),
    'rule_bz_close_negative': ('close_bazaar_day', 'rule', 'close-negative', _BZO + 'close_more_left_than_there / '),
    'rule_bz_close_sale_after': ('close_bazaar_day', 'rule', 'close-sale-after', _BZO + 'day_close_before_a_recorded_sale / '),
    'rule_bz_fin_shape': ('finalise_bazaar', 'rule', 'fin-shape', _BZO + 'finalise_bad_hash / '),
    'rule_bz_fin_booking_missing': ('finalise_bazaar', 'rule', 'fin-booking-missing', _BZO + 'finalise_booking_missing / '),
    'rule_bz_fin_replay_conflict': ('finalise_bazaar', 'rule', 'fin-replay-conflict', _BZO + 'finalise_again_other_hash / '),
    'rule_bz_fin_no_day': ('finalise_bazaar', 'rule', 'fin-no-day', _BZO + 'finalise_no_day_started / '),
    'rule_bz_fin_open_day': ('finalise_bazaar', 'rule', 'fin-open-day', _BZO + 'finalise_while_a_day_is_open / '),
    'rule_bz_fin_shop_no_recipe': ('finalise_bazaar', 'rule', 'fin-shop-no-recipe', _BZO + 'finalise_shop_flavour_without_recipe / '),
    'rule_bz_fin_drop': ('finalise_bazaar', 'rule', 'fin-drop', _BZO + 'finalise_bad_drop / '),
    'rule_bz_fin_stale': ('finalise_bazaar', 'rule', 'fin-stale', _BZO + 'finalise_stale_hash / '),
    'rule_bz_close_event_bazaar_day': ('close_event', 'rule', 'close-event-bazaar-day', _BZO + 'old_close_refused_on_a_bazaar_day / '),
    'rule_bz_fee_date': ('save_bazaar_fee', 'rule', 'fee-date', _BZO + 'fee_paid_on_far / '),
    'rule_bz_start_later_started': ('start_bazaar_day', 'rule', 'start-later-started', _BZO + 'start_before_a_started_day / '),
    'text_bz_till_expense_counts': ('bazaar_summary', 'text', ("where d.scheduled_id = p_booking and x.client_id <> 'rent:' || p_booking::text", 'where false'),
                                    _BZC + 'second_fair_summary / '),
    'text_bz_finalise_rows_not_twice': ('bazaar_summary', 'text',
                                        ('\n             and not exists (select 1 from public.bazaar_fees bf where bf.scheduled_id = p_booking and bf.ledger_id = x.ledger_id)', ''),
                                        _BZC + 'late_void_after_finalise / '),
    'rule_bz_cost_replay': ('save_bazaar_cost', 'rule', 'cost-replay', _BZC + 'cost_repeat_adds_nothing / '),
    'rule_bz_fin_rent': ('finalise_bazaar', 'rule', 'fin-rent', _BZC + 'finalise_posts_rent_and_fees / '),
    'rule_bz_fin_no_recipe': ('finalise_bazaar', 'rule', 'fin-no-recipe', _BZC + 'finalise_records_each_shortfall / '),
    'rule_bz_sale_packaging_bazaar_day': ('record_sale_packaging', 'rule', 'sale-packaging-bazaar-day', _BZC + 'bazaar_day_sale_takes_no_packaging / '),
    'text_bz_half_up': ('bazaar_summary', 'text', ("coalesce(round(x.made * x.unit_cents), 0)", "coalesce(trunc(x.made * x.unit_cents), 0)"), _BZC + 'example_while_c_has_no_cost / '),
    'text_bz_made_less_to_the_shop': ('bazaar_summary', 'text', ("y.made_cents - y.to_shop_cents as cost_cents", "y.made_cents as cost_cents"), _BZC + 'example_while_c_has_no_cost / '),
    'text_bz_typed_wins': ('bazaar_summary', 'text', ("coalesce(k.typed_cents, fc.cost_cents, k.recipe_cents) as cents", "coalesce(k.recipe_cents, fc.cost_cents, k.typed_cents) as cents"), _BZC + 'typed_cost_wins_over_the_recipe / '),
    'text_bz_profit_sign': ('bazaar_summary', 'text', ("- v_cookie + v_over - v_short;", "- v_cookie - v_over + v_short;"), _BZC + 'example_profit_and_target / '),
    'text_bz_cash_only': ('bazaar_summary', 'text', ("s.pay_method = 'Cash'), 0)::bigint as cash", "true), 0)::bigint as cash"), _BZC + 'day_one_takings / '),
    'text_bz_voided_counts_nowhere': ('bazaar_line_facts', 'text', ("where s.event_id = d.event_id and s.voided_at is null and i.product_id", "where s.event_id = d.event_id and i.product_id"), _BZC + 'day_one_stock / '),
    'text_bz_zero_total_is_given': ('bazaar_line_facts', 'text', ("filter (where s.total_cents = 0) as given", "filter (where false) as given"), _BZC + 'day_one_stock / '),
    # S3.1 (migration 69): the till check, taking back a fee or a loss, no sale after the finalise, no stock load on a bazaar day.
    'rule_bz_close_till': ('close_bazaar_day', 'rule', 'close-till', _BZO + 'close_till_count_off / '),
    'rule_bz_fin_till_shape': ('finalise_bazaar', 'rule', 'fin-till-shape', _BZO + 'finalise_till_shape / '),
    'rule_bz_fin_till_day': ('finalise_bazaar', 'rule', 'fin-till-day', _BZO + 'finalise_till_other_booking / '),
    'rule_bz_fin_till': ('finalise_bazaar', 'rule', 'fin-till', _BZO + 'finalise_till_count_off / '),
    'rule_bz_fee_void_shape': ('void_bazaar_fee', 'rule', 'fee-void-shape', _BZO + 'fee_void_shape / '),
    'rule_bz_fee_void_missing': ('void_bazaar_fee', 'rule', 'fee-void-missing', _BZO + 'fee_void_missing / '),
    'rule_bz_fee_void_finalised': ('void_bazaar_fee', 'rule', 'fee-void-finalised', _BZO + 'fee_void_after_finalise / '),
    'rule_bz_loss_void_shape': ('void_bazaar_loss', 'rule', 'loss-void-shape', _BZO + 'loss_void_shape / '),
    'rule_bz_loss_void_missing': ('void_bazaar_loss', 'rule', 'loss-void-missing', _BZO + 'loss_void_missing / '),
    'rule_bz_loss_void_day_closed': ('void_bazaar_loss', 'rule', 'loss-void-day-closed', _BZO + 'loss_void_day_closed / '),
    'rule_bz_sale_finalised': ('refuse_finalised_bazaar_sale', 'rule', 'sale-finalised', _BZO + 'sale_after_finalise / '),
    'rule_bz_load_bazaar_day': ('load_event_stock', 'rule', 'load-bazaar-day', _BZO + 'load_stock_on_a_bazaar_day / '),
    'text_bz_void_fee_listed': ('bazaar_summary', 'text', ('where f.scheduled_id = p_booking and f.voided_at is null', 'where f.scheduled_id = p_booking'),
                                _BZC + 'void_leaves_the_figures / '),
    'text_bz_void_fee_of_the_day': ('bazaar_summary', 'text', ('where f.day_id = v_d.id and f.voided_at is null;', 'where f.day_id = v_d.id;'),
                                    _BZC + 'void_leaves_the_figures / '),
    'text_bz_void_loss_counted': ('bazaar_line_facts', 'text', ('\n                                              and o.voided_at is null) x on true', ') x on true'),
                                  _BZC + 'void_leaves_the_figures / '),
    'text_bz_void_loss_listed': ('get_bazaar', 'text', ('where d.scheduled_id = p_booking and o.voided_at is null),', 'where d.scheduled_id = p_booking),'),
                                 _BZC + 'void_leaves_the_figures / '),
    'text_bz_void_fee_posted': ('finalise_bazaar', 'text', ('and f.ledger_id is null and f.voided_at is null', 'and f.ledger_id is null'),
                                _BZC + 'finalise_skips_a_voided_fee / '),
    'text_bz_incomplete_recipe': ('start_bazaar_day', 'text', ("where r ->> 'product_id' = l.product_id and (r ->> 'complete')::boolean),", "where r ->> 'product_id' = l.product_id),"), _BZC + 'incomplete_recipe_is_no_cost / '),
    'text_bz_held_lines': ('get_books', 'text', ("select coalesce(array_agg(h.ledger_id), '{}'::uuid[]) into v_held_ids", "select '{}'::uuid[] into v_held_ids"), _BZC + 'books_hold_an_open_bazaar / '),
    'text_bz_held_period': ('get_books', 'text', ("where l.occurred_at >= p_from and l.occurred_at < p_to\n           group by h.scheduled_id", "where true\n           group by h.scheduled_id"), _BZC + 'books_held_follows_the_period / '),
    'text_bz_variance_sign': ('finalise_bazaar', 'text', ("v_d.over - v_d.short, v_d.closed_at", "v_d.short - v_d.over, v_d.closed_at"), _BZC + 'finalise_posts_the_cash_variance / '),
    'text_bz_packaging_per_cookie': ('finalise_bazaar', 'text', ("l.qty * v_p.qty as amount", "l.qty as amount"), _BZC + 'finalise_takes_stock / '),
    'text_bz_shop_batch_drop': ('finalise_bazaar', 'text', ('v_p.qty, v_p.qty, 0, 0, r.version, p_drop, v_at,', 'v_p.qty, v_p.qty, 0, 0, r.version, 0, v_at,'),
                                _BZC + 'finalise_shop_batch_enters_baked_stock / '),
    'text_bz_shop_not_taken_twice': ('finalise_bazaar', 'text', ("(l ->> 'made')::integer - (l ->> 'to_shop')::integer as qty", "(l ->> 'made')::integer as qty"),
                                     _BZC + 'finalise_shop_cookies_take_ingredients_once / '),
    'text_bz_bag_per_sale': ('finalise_bazaar', 'text', ("else v_sales end as amount", "else 1 end as amount"), _BZC + 'finalise_records_each_shortfall / '),
    # U6 (migration 70): a flavour's typed cost, the final split of the cookies no day took, the drawer as an adjustment, no packaging record without
    # a rule, and the reversal of a test event.
    'rule_bz_fcost_value': ('save_flavour_cost', 'rule', 'fcost-value', _BZO + 'fcost_negative / '),
    'rule_bz_fcost_flavour': ('save_flavour_cost', 'rule', 'fcost-flavour', _BZO + 'fcost_flavour_missing / '),
    'rule_bz_fcost_replay': ('save_flavour_cost', 'rule', 'fcost-replay', _BZC + 'fcost_repeat_adds_nothing / '),
    'text_bz_flavour_cost_between': ('bazaar_summary', 'text', ("coalesce(k.typed_cents, fc.cost_cents, k.recipe_cents) as cents", "coalesce(k.typed_cents, k.recipe_cents, fc.cost_cents) as cents"),
                                     _BZC + 'flavour_cost_beats_the_recipe / '),
    'text_bz_booking_cost_beats_flavour': ('bazaar_summary', 'text', ("coalesce(k.typed_cents, fc.cost_cents, k.recipe_cents) as cents", "coalesce(fc.cost_cents, k.typed_cents, k.recipe_cents) as cents"),
                                           _BZC + 'booking_cost_beats_the_flavour_cost / '),
    'text_bz_flavour_cost_without_row': ('bazaar_summary', 'text', ("left join public.flavour_costs fc on fc.product_id = f.product_id", "left join public.flavour_costs fc on k.product_id is not null and fc.product_id = f.product_id"),
                                         _BZC + 'flavour_cost_without_a_booking_row / '),
    'rule_bz_fin_final_shape': ('finalise_bazaar', 'rule', 'fin-final-shape', _BZO + 'finalise_split_fraction / '),  # the NULL-safe sum check (U9) now refuses a missing part first, so the shape rule is first needed for a fraction
    'rule_bz_fin_final_flavours': ('finalise_bazaar', 'rule', 'fin-final-flavours', _BZO + 'finalise_split_names_a_flavour_not_stranded / '),
    'rule_bz_fin_final_sum': ('finalise_bazaar', 'rule', 'fin-final-sum', _BZO + 'finalise_split_does_not_add_up / '),
    'rule_bz_fin_replay_split': ('finalise_bazaar', 'rule', 'fin-replay-split', _BZO + 'finalise_again_other_split / '),
    'text_bz_final_split_to_the_shop': ('finalise_bazaar', 'text', ("to_shop_qty = l.to_shop_qty + (v_final -> (v_sx ->> 'product_id') ->> 'to_shop')::integer,", "to_shop_qty = l.to_shop_qty,"),
                                        'bazaar_day_lines_split'),
    'text_bz_final_split_recomputes': ('finalise_bazaar', 'text', ("    -- Every figure below, the shop batch included, is read from the lines as they are now.\n    select public.bazaar_summary(p_booking) into v_sum;\n",
                                                                  "    -- Every figure below, the shop batch included, is read from the lines as they are now.\n"),
                                       _BZC + 'finalise_with_a_final_split / '),
    'text_bz_over_is_not_a_sale': ('finalise_bazaar', 'text', ("else 'adjustment'::public.ledger_kind end,", "else 'sale'::public.ledger_kind end,"), _BZC + 'finalise_posts_the_cash_variance / '),
    'text_bz_no_rule_no_packaging_record': ('finalise_bazaar', 'text', ("if v_sales > 0 and exists (select 1 from public.packaging_rules r where r.container = 'bazaar_sale') then", "if v_sales > 0 then"),
                                            _BZC + 'finalise_with_no_packaging_rule_writes_nothing / '),
    'rule_bz_rev_shape': ('reverse_bazaar_test', 'rule', 'rev-shape', _BZO + 'reverse_shape / '),
    'rule_bz_rev_booking_missing': ('reverse_bazaar_test', 'rule', 'rev-booking-missing', _BZO + 'reverse_booking_missing / '),
    'rule_bz_rev_name': ('reverse_bazaar_test', 'rule', 'rev-name', _BZO + 'reverse_wrong_name / '),
    'rule_bz_rev_not_finalised': ('reverse_bazaar_test', 'rule', 'rev-not-finalised', _BZO + 'reverse_not_finalised / '),
    'rule_bz_rev_shop': ('reverse_bazaar_test', 'rule', 'rev-shop', _BZO + 'reverse_sent_cookies_to_the_shop / '),
    'rule_bz_rev_cutover': ('reverse_bazaar_test', 'rule', 'rev-cutover', _BZO + 'reverse_after_a_cost_cutover / '),
    'rule_bz_rev_counted': ('reverse_bazaar_test', 'rule', 'rev-counted', _BZO + 'reverse_after_a_count / '),
    'rule_bz_rev_ledger': ('reverse_bazaar_test', 'rule', 'rev-ledger', _BZO + 'reverse_ledger_off_by_a_centavo / '),
    'rule_bz_rev_replay': ('reverse_bazaar_test', 'rule', 'rev-replay', _BZO + 'reverse_repeat_answered / '),
    'text_bz_reverse_negates': ('reverse_bazaar_test', 'text', ("-l.amount_cents, l.occurred_at, auth.uid()", "l.amount_cents, l.occurred_at, auth.uid()"), _BZC + 'reverse_negates_each_line / '),
    'text_bz_reverse_keeps_the_date': ('reverse_bazaar_test', 'text', ("-l.amount_cents, l.occurred_at, auth.uid()", "-l.amount_cents, now(), auth.uid()"), _BZC + 'reverse_keeps_the_dates / '),
    'text_bz_reverse_only_what_was_taken': ('reverse_bazaar_test', 'text', ("-m.qty_delta as take", "-m.qty_delta + m.short_qty as take"), _BZC + 'reverse_restores_stock / '),
    'text_bz_reverse_checks_revenue': ('reverse_bazaar_test', 'text', ("           or v_sales <> (v_sum -> 'revenue' ->> 'revenue_cents')::bigint\n", ""), _BZO + 'reverse_sales_off_by_a_centavo / '),
    'text_bz_reverse_checks_fees': ('reverse_bazaar_test', 'text', ("           or v_costs <> (v_sum -> 'fees' ->> 'total_cents')::bigint\n", ""), _BZO + 'reverse_ledger_off_by_a_centavo / '),
}
BAZAAR_DAY_ACL = ('get_bazaar(uuid)', 'save_bazaar_day(jsonb,timestamptz)', 'save_bazaar_fee(jsonb)', 'save_bazaar_loss(jsonb)',
                  'save_bazaar_cost(uuid,text,numeric)', 'save_bazaar_target(uuid,bigint)', 'start_bazaar_day(uuid,text,uuid)',
                  'add_bazaar_day_stock(uuid,text,integer,text,uuid)', 'close_bazaar_day(jsonb)', 'finalise_bazaar(uuid,text,integer,jsonb,jsonb)',
                  'void_bazaar_fee(text)', 'void_bazaar_loss(text)', 'save_flavour_cost(text,numeric)', 'get_flavour_costs()', 'reverse_bazaar_test(uuid,text)', 'refuse_finalised_bazaar_sale()', 'bazaar_summary(uuid)', 'bazaar_line_facts(uuid)', 'bazaar_held_ledger()', 'recipe_stock_plan(text,numeric,text,jsonb)')
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
    ('table-truncate.sql', ('settings_truncate',), 'forbidden truncate succeeded: anon / settings', 46),
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
     'forbidden stock call succeeded', 172),
    ('recipes.sql', ('get_recipes()', 'save_recipe(jsonb,timestamptz)') + tuple(RECIPE_MUTATIONS) + tuple(RECIPE_TABLE_MUTATIONS),
     'forbidden recipe call succeeded', 96),
    ('identity-links.sql', ('preview_identity_links()', 'apply_identity_links(jsonb)') + tuple(LINK_MUTATIONS), 'forbidden link call succeeded', 53),
    ('recipe-drafts.sql', (), 'draft outcome differs', 21),
    ('stock-ledger.sql', ('record_stock_movement(jsonb)', 'get_last_paid()') + tuple(LEDGER_MUTATIONS) + tuple(LEDGER_TABLE_MUTATIONS),
     'forbidden ledger call succeeded', 87),
    ('production.sql', ('record_production(jsonb)', 'record_pack(text,integer)', 'get_production(integer)', 'record_discard(jsonb)')
                       + tuple(PRODUCTION_MUTATIONS) + tuple(PRODUCTION_TABLE_MUTATIONS), 'forbidden production call succeeded', 129),
    ('books.sql', ('get_books(timestamptz,timestamptz)', 'record_expense(jsonb)', 'record_cost_correction(jsonb)', 'set_cost_basis(text)', 'record_draw(jsonb)')
                  + tuple(BOOKS_MUTATIONS) + tuple(BOOKS_TABLE_MUTATIONS), 'forbidden books call succeeded', 110),
    ('item-costs.sql', ('save_item_price(jsonb)', 'get_item_costs()', 'get_recipe_costs()') + tuple(COST_MUTATIONS),
     'forbidden cost call succeeded', 172),
    ('item-movements.sql', ('get_item_movements(text,integer)',) + tuple(MOVEMENT_MUTATIONS), 'forbidden movements call succeeded', 31),
    ('batch-correction.sql', ('record_batch_correction(jsonb)',) + tuple(BATCH_CORRECTION_MUTATIONS), 'forbidden correction call succeeded', 110),
    ('packaging.sql', ('get_packaging_rules()', 'save_packaging_rule(jsonb)', 'write_packaging_rule(jsonb)', 'apply_packaging_rule(jsonb)')
                      + tuple(PACKAGING_MUTATIONS) + tuple(PACKAGING_TABLE_MUTATIONS), 'forbidden packaging call succeeded', 146),
    ('cutover.sql', ('preview_cost_cutover()', 'apply_cost_cutover(jsonb)') + tuple(COST_CUTOVER_MUTATIONS) + tuple(COST_CUTOVER_TABLE_MUTATIONS),
     'forbidden cutover call succeeded', 152),
    ('imports.sql', IMPORT_ACL + tuple(IMPORT_MUTATIONS), 'forbidden import call succeeded', 261),
    ('operations.sql', tuple(OPERATIONS_MUTATIONS), 'forbidden operations call succeeded', 14),
    ('bazaar-closeout.sql', ('event_summary(uuid)', 'load_event_stock(uuid,jsonb,bigint)', 'add_event_expense(jsonb)', 'close_event(jsonb)'), 'forbidden closeout call succeeded', 80),
    ('bazaar-days.sql', BAZAAR_DAY_ACL + tuple(BAZAAR_DAY_MUTATIONS), 'forbidden bazaar day call succeeded', 317),
    ('shop-identity.sql', ('save_shop_identity(jsonb,timestamptz)', 'business_clock(timestamptz)') + tuple(IDENTITY_MUTATIONS) + tuple(IDENTITY_RULES),
     'forbidden identity call succeeded', IDENTITY_ROWS),
    ('policies.sql', tuple(POLICY_MUTATIONS), 'policy', 42),
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
    for table in ('orders', 'order_items', 'products', 'drops', 'settings', 'rate_limits', 'profiles', 'audit_log', 'ledger_entries', 'event_sales', 'event_sale_items', 'inventory_items', 'packaging_rules', 'cost_cutover', 'bake_batches', 'recipes', 'recipe_ingredients', 'suppliers', 'supplier_prices', 'events', 'erasure_requests', 'payment_methods', 'shop_texts', 'shop_identity', 'waitlist_entries', 'order_add_ons', 'order_boxes', 'scheduled_events', 'recipe_versions', 'stock_movements', 'item_prices')) + " and not exists(select 1 from auth.users) and to_regnamespace('mp06f_probe') is null and to_regnamespace('mp06g_probe') is null and to_regclass('public.mp06g_future') is null and to_regclass('public.mp06g_future_id_seq') is null;"


def main():
    if len(sys.argv) != 1:
        h.fail("security fixture accepts no URLs, project refs or arguments")
    report = {"status": "failed", "scope": "Local SQL-role containment and erasure authority/effects; not JWT/API, hosted erasure or full MP-06 acceptance", "runs": [], "regressions_detected": [], "upgrade_runs": 0, "legacy_regression_diagnostics": [], "sequence_restorations": 0, "function_guard_runs": 0, "pair_guard_runs": 0, "catalog_guard_runs": 0, "catalog_guard_red_runs": 0}

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
        def assert_pair_guard():
            # B4a-2 (P2): migration 63 stops, listing the pairs, when a packaging rule already takes an item that a recipe takes as an ingredient.
            # The guard is the migration's first `do` block; it runs here on its own over a rolled-back fixture, once with no pair (a packaging
            # line may share its item with a rule) and once with a pair.
            text = (ROOT / 'supabase/migrations/20260101006200_cost_cutover_fix.sql').read_text(encoding='utf-8')
            start = text.index('do $$')
            guard = text[start:text.index('end $$;', start) + len('end $$;')]
            fixture = (
                "insert into public.products(id, name, short_name, price_cents, kind) values ('pgp1', 'PG cookie', 'PG-1', 100, 'cookie');\n"
                "insert into public.inventory_items(id, name, unit, category, active, on_hand) values ('pgi-a', 'PG A', 'g', 'Ingredients', true, 1), ('pgi-b', 'PG B', 'pcs', 'Packaging', true, 1);\n"
                "insert into public.recipes(product_id, yield_count) values ('pgp1', 1);\n"
                "insert into public.recipe_ingredients(product_id, item_name, qty, unit, position, item_id, kind) values "
                "('pgp1', 'PG A', 1, 'g', 0, 'pgi-a', 'ingredient'), ('pgp1', 'PG B', 1, 'pcs', 1, 'pgi-b', 'packaging');\n"
                "insert into public.packaging_rules(container, item_id, qty, per, position) values ('order', 'pgi-b', 1, 'container', 1);\n")
            green = 'begin;\n' + fixture + guard + "\nselect 'PAIR_GUARD_PASSED';\nrollback;"
            if 'PAIR_GUARD_PASSED' not in h.psql(db_id, workdir, green):
                h.fail('pair guard stopped a database with no rule/ingredient pair')
            red = ('begin;\n' + fixture
                   + "insert into public.packaging_rules(container, item_id, qty, per, position) values ('loose', 'pgi-a', 1, 'cookie', 1);\n"
                   + guard + "\nselect 'PAIR_GUARD_PASSED';\nrollback;")
            try:
                out = h.psql(db_id, workdir, red)
            except RuntimeError as error:
                message = str(error)
                if 'an item that a recipe takes as an ingredient' not in message or 'recipe pgp1' not in message or 'item pgi-a' not in message or 'pgi-b' in message:
                    h.fail('pair guard stopped without listing exactly the pair: ' + message[:300])
            else:
                h.fail('pair guard let a rule/ingredient pair through: ' + out[:200])
            report['pair_guard_runs'] += 1
        assert_pair_guard()
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
            sql = raw_sql.replace('__FUTURE_RED_GRANT__', '').replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', '').replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', '').replace('__CLOCK_CASES__', json.dumps(json.loads(CLOCK_CASES)).replace("'", "''")).replace('__POLICIES_BEFORE__', json.dumps(json.loads(POLICIES_BEFORE)).replace("'", "''"))
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
                if filename == 'maintenance.sql' and signature == 'prune_personal_data(integer)':
                    # The in-function service guard refuses the injected grant; the later ACL oracle catches it.
                    expected_error = 'effective maintenance execute still granted'
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
                if filename == 'production.sql':
                    if signature in PRODUCTION_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = PRODUCTION_MUTATIONS[signature][3]
                    elif signature in PRODUCTION_TABLE_MUTATIONS:
                        unsafe, expected_error = PRODUCTION_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'books.sql':
                    if signature in BOOKS_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = BOOKS_MUTATIONS[signature][3]
                    elif signature in BOOKS_TABLE_MUTATIONS:
                        unsafe, expected_error = BOOKS_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'batch-correction.sql' and signature in BATCH_CORRECTION_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = BATCH_CORRECTION_MUTATIONS[signature][3]
                if filename == 'packaging.sql':
                    if signature in PACKAGING_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = PACKAGING_MUTATIONS[signature][3]
                    elif signature in PACKAGING_TABLE_MUTATIONS:
                        unsafe, expected_error = PACKAGING_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'cutover.sql':
                    if signature in COST_CUTOVER_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = COST_CUTOVER_MUTATIONS[signature][3]
                    elif signature in COST_CUTOVER_TABLE_MUTATIONS:
                        unsafe, expected_error = COST_CUTOVER_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'imports.sql' and signature in IMPORT_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = IMPORT_MUTATIONS[signature][3]
                if filename == 'item-movements.sql' and signature in MOVEMENT_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = MOVEMENT_MUTATIONS[signature][3]
                if filename == 'bazaar-days.sql' and signature in BAZAAR_DAY_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = BAZAAR_DAY_MUTATIONS[signature][3]
                if filename == 'item-costs.sql' and signature in COST_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = COST_MUTATIONS[signature][3]
                if filename == 'identity-links.sql' and signature in LINK_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = LINK_MUTATIONS[signature][3]
                if filename == 'operations.sql':
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = OPERATIONS_MUTATIONS[signature][3]
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
                if filename == 'shop-identity.sql' and signature in IDENTITY_MUTATIONS:
                    unsafe, expected_error = IDENTITY_MUTATIONS[signature]
                    broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'shop-identity.sql' and signature in IDENTITY_RULES:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = IDENTITY_RULES[signature][3]
                if filename == 'policies.sql':
                    unsafe, expected_error = POLICY_MUTATIONS[signature]
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
        if len(set(results)) != 3366:
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
                and len(report['regressions_detected']) == 1578 and report['sequence_restorations'] == 10
                and report['upgrade_runs'] == 2 and report['pair_guard_runs'] == 2 and report['function_guard_runs'] == 4
                and report['catalog_guard_runs'] == 4 and report['catalog_guard_red_runs'] == 4):
            report.update(status="passed", cases_per_reset=3366, resets=2, matrix_equal=True, rollback_verified=True,
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
