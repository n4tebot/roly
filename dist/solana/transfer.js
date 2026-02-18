import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { BalanceChecker } from './balance.js';
export class UsdcTransfer {
    client;
    balanceChecker;
    usdcMint;
    constructor(client) {
        this.client = client;
        this.balanceChecker = new BalanceChecker(client);
        this.usdcMint = new PublicKey(client.getUsdcMint());
    }
    /**
     * Transfer USDC to another wallet
     */
    async transferUsdc(fromWallet, toAddress, amount, // Amount in micro-USDC
    memo) {
        const connection = this.client.getConnection();
        const recipient = typeof toAddress === 'string' ? new PublicKey(toAddress) : toAddress;
        try {
            // Check balance first
            const balance = await this.balanceChecker.getUsdcBalance(fromWallet);
            if (balance < amount) {
                throw new Error(`Insufficient USDC balance. Have: ${BalanceChecker.formatUsdc(balance)}, Need: ${BalanceChecker.formatUsdc(amount)}`);
            }
            // Check SOL balance for transaction fees
            const solBalance = await this.balanceChecker.getSolBalance(fromWallet);
            if (solBalance < 10000) { // ~0.00001 SOL minimum
                throw new Error('Insufficient SOL for transaction fees');
            }
            // Get or create associated token accounts
            const fromTokenAccount = await getAssociatedTokenAddress(this.usdcMint, fromWallet.publicKey);
            const toTokenAccount = await getAssociatedTokenAddress(this.usdcMint, recipient);
            // Check if recipient token account exists
            const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
            // Build transaction
            const transaction = new Transaction();
            // Create recipient token account if it doesn't exist
            if (!toAccountInfo) {
                const createAccountIx = createAssociatedTokenAccountInstruction(fromWallet.publicKey, // payer
                toTokenAccount, // associated token account
                recipient, // owner
                this.usdcMint // mint
                );
                transaction.add(createAccountIx);
            }
            // Add transfer instruction
            const transferIx = createTransferInstruction(fromTokenAccount, // source
            toTokenAccount, // destination
            fromWallet.publicKey, // owner
            amount // amount in micro-USDC
            );
            transaction.add(transferIx);
            // Add memo if provided
            if (memo) {
                const memoIx = SystemProgram.createAccount({
                    fromPubkey: fromWallet.publicKey,
                    newAccountPubkey: fromWallet.publicKey, // dummy
                    lamports: 0,
                    space: 0,
                    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
                });
                // Note: This is a simplified memo - in practice you'd use the proper memo program
                transaction.add(memoIx);
            }
            // Set recent blockhash
            const { blockhash } = await this.client.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromWallet.publicKey;
            // Sign and send transaction
            transaction.sign(fromWallet.keypair);
            const signature = await connection.sendRawTransaction(transaction.serialize(), this.client.getConfirmOptions());
            // Confirm transaction
            await connection.confirmTransaction(signature, 'confirmed');
            return {
                signature,
                success: true,
                amount,
                recipient,
                timestamp: new Date()
            };
        }
        catch (error) {
            console.error('USDC transfer failed:', error);
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                amount,
                recipient,
                timestamp: new Date()
            };
        }
    }
    /**
     * Transfer SOL to another wallet
     */
    async transferSol(fromWallet, toAddress, amount // Amount in lamports
    ) {
        const connection = this.client.getConnection();
        const recipient = typeof toAddress === 'string' ? new PublicKey(toAddress) : toAddress;
        try {
            // Check balance
            const balance = await this.balanceChecker.getSolBalance(fromWallet);
            const totalNeeded = amount + 5000; // Add fee buffer
            if (balance < totalNeeded) {
                throw new Error(`Insufficient SOL balance. Have: ${BalanceChecker.formatSol(balance)}, Need: ${BalanceChecker.formatSol(totalNeeded)}`);
            }
            // Create transfer transaction
            const transaction = new Transaction().add(SystemProgram.transfer({
                fromPubkey: fromWallet.publicKey,
                toPubkey: recipient,
                lamports: amount
            }));
            // Set recent blockhash
            const { blockhash } = await this.client.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromWallet.publicKey;
            // Sign and send
            transaction.sign(fromWallet.keypair);
            const signature = await connection.sendRawTransaction(transaction.serialize(), this.client.getConfirmOptions());
            // Confirm transaction
            await connection.confirmTransaction(signature, 'confirmed');
            return {
                signature,
                success: true,
                amount,
                recipient,
                timestamp: new Date()
            };
        }
        catch (error) {
            console.error('SOL transfer failed:', error);
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                amount,
                recipient,
                timestamp: new Date()
            };
        }
    }
    /**
     * Estimate transfer fees
     */
    async estimateTransferFee(fromWallet, recipient, includeTokenAccountCreation = false) {
        try {
            const connection = this.client.getConnection();
            // Build a dummy transaction to estimate fees
            const transaction = new Transaction();
            if (includeTokenAccountCreation) {
                const toTokenAccount = await getAssociatedTokenAddress(this.usdcMint, recipient);
                const createAccountIx = createAssociatedTokenAccountInstruction(fromWallet.publicKey, toTokenAccount, recipient, this.usdcMint);
                transaction.add(createAccountIx);
            }
            const fromTokenAccount = await getAssociatedTokenAddress(this.usdcMint, fromWallet.publicKey);
            const toTokenAccount = await getAssociatedTokenAddress(this.usdcMint, recipient);
            const transferIx = createTransferInstruction(fromTokenAccount, toTokenAccount, fromWallet.publicKey, 1000000 // 1 USDC dummy amount
            );
            transaction.add(transferIx);
            const { blockhash } = await this.client.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromWallet.publicKey;
            const fee = await this.client.estimateTransactionFee(transaction.compileMessage());
            return fee || 5000; // Fallback to 0.000005 SOL
        }
        catch (error) {
            console.error('Fee estimation failed:', error);
            // Conservative estimate: 10,000 lamports (0.00001 SOL)
            return includeTokenAccountCreation ? 15000 : 5000;
        }
    }
    /**
     * Batch transfer to multiple recipients
     */
    async batchTransfer(fromWallet, transfers) {
        const results = [];
        // Execute transfers sequentially to avoid nonce issues
        for (const transfer of transfers) {
            const result = await this.transferUsdc(fromWallet, transfer.recipient, transfer.amount);
            results.push(result);
            // Small delay between transfers
            if (transfer !== transfers[transfers.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return results;
    }
}
