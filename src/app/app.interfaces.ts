import { IndexedTx } from '@cosmjs/launchpad';
import { TxStatus } from './app.enums';

export interface TxForm {
	memo: string;
	senderAddress: string;
	recipientAddress: string;
	amount: number;
}

export interface TxElement extends IndexedTx {
	transactionHash: string;
	status: TxStatus;
}
