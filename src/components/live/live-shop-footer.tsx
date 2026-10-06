import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

/**
 * The shop footer in live mode (MP-09 c2, finding 16, the D4 shop-text exception): the ported
 * footer states a BIR registration, a placeholder TIN and an invoice for every order, none of
 * which the business has claimed. Here the footer says only what the owner has typed in
 * "Shop texts"; an empty line prints nothing. The lookup link stays. Existing tokens only.
 */
export function LiveShopFooter({ v }: { v: OpsVals }) {
  const footer = v.shopFooter ?? { badge: '', tin: '', invoice: '', allergens: '' };
  const note = [footer.invoice, footer.allergens].filter(Boolean).join(' ');
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '4px 2px 0' }}>
      {footer.badge ? (
        <span
          style={{
            width: '44px',
            height: '44px',
            flexShrink: '0',
            borderRadius: '10px',
            border: '1px solid #EADCC4',
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px'
          }}
        >
          <span
            style={{
              fontSize: '8px',
              fontWeight: '600',
              lineHeight: '1.1',
              color: '#C24A15',
              textAlign: 'center',
              overflowWrap: 'anywhere'
            }}
          >
            {footer.badge}
          </span>
        </span>
      ) : null}
      <span
        style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}
      >
        {footer.tin ? (
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B' }}>
            {footer.tin}
          </span>
        ) : null}
        {note ? (
          <span
            style={{ fontSize: '10px', lineHeight: '1.5', color: '#8A7062', textWrap: 'pretty' }}
          >
            {note}
          </span>
        ) : null}
        <span style={{ fontSize: '10px', lineHeight: '1.5', color: '#8A7062', textWrap: 'pretty' }}>
          Privacy: {v.shopName || 'This shop'} uses your name, phone number, optional Instagram
          handle and order details to fulfil orders and contact you. Supabase hosts the database.
          Customer name, phone, Instagram and add-on-note fields are cleared from orders older than
          one year by our retention routine. Payment references and financial records remain for
          bookkeeping. Encrypted backup copies are kept separately and may contain older details.
          For access, corrections or removal, contact {v.shopName || 'the shop'} through its usual
          ordering channel.
        </span>
        <Pressable
          as="button"
          onClick={v.openLookup}
          style={{
            alignSelf: 'flex-start',
            minHeight: '38px',
            padding: '0',
            border: '0',
            background: 'transparent',
            fontSize: '11px',
            fontWeight: '600',
            color: '#6E574B',
            transition: 'color .18s ease'
          }}
          hoverStyle={{ color: '#3A1F14' }}
        >
          Already ordered? Find my order
        </Pressable>
        {v.openWaitlist ? (
          <Pressable
            as="button"
            onClick={v.openWaitlist}
            style={{
              alignSelf: 'flex-start',
              minHeight: '38px',
              padding: '0',
              border: '0',
              background: 'transparent',
              fontSize: '11px',
              fontWeight: '600',
              color: '#6E574B',
              transition: 'color .18s ease'
            }}
            hoverStyle={{ color: '#3A1F14' }}
          >
            Join the waiting list
          </Pressable>
        ) : null}
      </span>
    </div>
  );
}
