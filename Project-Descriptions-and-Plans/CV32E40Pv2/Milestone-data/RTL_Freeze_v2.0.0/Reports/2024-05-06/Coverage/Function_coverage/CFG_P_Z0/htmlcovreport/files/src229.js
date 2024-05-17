var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P_Z0/NR_QUESTA_INT_DEBUG_LONG/workdir/core-v-cores/cv32e40p/rtl/cv32e40p_if_stage.sv","src":"// Copyright 2018 ETH Zurich and University of Bologna.\n// Copyright and related rights are licensed under the Solderpad Hardware\n// License, Version 0.51 (the \"License\"); you may not use this file except in\n// compliance with the License.  You may obtain a copy of the License at\n// http://solderpad.org/licenses/SHL-0.51. Unless required by applicable law\n// or agreed to in writing, software, hardware and materials distributed under\n// this License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR\n// CONDITIONS OF ANY KIND, either express or implied. See the License for the\n// specific language governing permissions and limitations under the License.\n\n////////////////////////////////////////////////////////////////////////////////\n// Engineer:       Renzo Andri - andrire@student.ethz.ch                      //\n//                                                                            //\n// Additional contributions by:                                               //\n//                 Igor Loi - igor.loi@unibo.it                               //\n//                 Andreas Traber - atraber@student.ethz.ch                   //\n//                 Sven Stucki - svstucki@student.ethz.ch                     //\n//                                                                            //\n// Design Name:    Instruction Fetch Stage                                    //\n// Project Name:   RI5CY                                                      //\n// Language:       SystemVerilog                                              //\n//                                                                            //\n// Description:    Instruction fetch unit: Selection of the next PC, and      //\n//                 buffering (sampling) of the read instruction               //\n//                                                                            //\n////////////////////////////////////////////////////////////////////////////////\n\nmodule cv32e40p_if_stage #(\n    parameter COREV_PULP = 0, // PULP ISA Extension (including PULP specific CSRs and hardware loop, excluding cv.elw)\n    parameter PULP_OBI = 0,  // Legacy PULP OBI behavior\n    parameter PULP_SECURE = 0,\n    parameter FPU = 0,\n    parameter ZFINX = 0\n) (\n    input logic clk,\n    input logic rst_n,\n\n    // Used to calculate the exception offsets\n    input logic [23:0] m_trap_base_addr_i,\n    input logic [23:0] u_trap_base_addr_i,\n    input logic [ 1:0] trap_addr_mux_i,\n    // Boot address\n    input logic [31:0] boot_addr_i,\n    input logic [31:0] dm_exception_addr_i,\n\n    // Debug mode halt address\n    input logic [31:0] dm_halt_addr_i,\n\n    // instruction request control\n    input logic req_i,\n\n    // instruction cache interface\n    output logic instr_req_o,\n    output logic [31:0] instr_addr_o,\n    input logic instr_gnt_i,\n    input logic instr_rvalid_i,\n    input logic [31:0] instr_rdata_i,\n    input logic instr_err_i,      // External bus error (validity defined by instr_rvalid_i) (not used yet)\n    input logic instr_err_pmp_i,  // PMP error (validity defined by instr_gnt_i)\n\n    // Output of IF Pipeline stage\n    output logic instr_valid_id_o,  // instruction in IF/ID pipeline is valid\n    output logic [31:0] instr_rdata_id_o,      // read instruction is sampled and sent to ID stage for decoding\n    output logic is_compressed_id_o,  // compressed decoder thinks this is a compressed instruction\n    output logic illegal_c_insn_id_o,  // compressed decoder thinks this is an invalid instruction\n    output logic [31:0] pc_if_o,\n    output logic [31:0] pc_id_o,\n    output logic is_fetch_failed_o,\n\n    // Forwarding ports - control signals\n    input logic clear_instr_valid_i,  // clear instruction valid bit in IF/ID pipe\n    input logic pc_set_i,  // set the program counter to a new value\n    input logic [31:0] mepc_i,  // address used to restore PC when the interrupt/exception is served\n    input logic [31:0] uepc_i,  // address used to restore PC when the interrupt/exception is served\n\n    input logic [31:0] depc_i,  // address used to restore PC when the debug is served\n\n    input logic [3:0] pc_mux_i,  // sel for pc multiplexer\n    input logic [2:0] exc_pc_mux_i,  // selects ISR address\n\n    input  logic [4:0] m_exc_vec_pc_mux_i,  // selects ISR address for vectorized interrupt lines\n    input  logic [4:0] u_exc_vec_pc_mux_i,  // selects ISR address for vectorized interrupt lines\n    output logic       csr_mtvec_init_o,  // tell CS regfile to init mtvec\n\n    // jump and branch target and decision\n    input logic [31:0] jump_target_id_i,  // jump target address\n    input logic [31:0] jump_target_ex_i,  // jump target address\n\n    // from hwloop controller\n    input logic        hwlp_jump_i,\n    input logic [31:0] hwlp_target_i,\n\n    // pipeline stall\n    input logic halt_if_i,\n    input logic id_ready_i,\n\n    // misc signals\n    output logic if_busy_o,  // is the IF stage busy fetching instructions?\n    output logic perf_imiss_o  // Instruction Fetch Miss\n);\n\n  import cv32e40p_pkg::*;\n\n  logic if_valid, if_ready;\n\n  // prefetch buffer related signals\n  logic        prefetch_busy;\n  logic        branch_req;\n  logic [31:0] branch_addr_n;\n\n  logic        fetch_valid;\n  logic        fetch_ready;\n  logic [31:0] fetch_rdata;\n\n  logic [31:0] exc_pc;\n\n  logic [23:0] trap_base_addr;\n  logic [ 4:0] exc_vec_pc_mux;\n  logic        fetch_failed;\n\n  logic        aligner_ready;\n  logic        instr_valid;\n\n  logic        illegal_c_insn;\n  logic [31:0] instr_aligned;\n  logic [31:0] instr_decompressed;\n  logic        instr_compressed_int;\n\n\n  // exception PC selection mux\n  always_comb begin : EXC_PC_MUX\n    unique case (trap_addr_mux_i)\n      TRAP_MACHINE: trap_base_addr = m_trap_base_addr_i;\n      TRAP_USER:    trap_base_addr = u_trap_base_addr_i;\n      default:      trap_base_addr = m_trap_base_addr_i;\n    endcase\n\n    unique case (trap_addr_mux_i)\n      TRAP_MACHINE: exc_vec_pc_mux = m_exc_vec_pc_mux_i;\n      TRAP_USER:    exc_vec_pc_mux = u_exc_vec_pc_mux_i;\n      default:      exc_vec_pc_mux = m_exc_vec_pc_mux_i;\n    endcase\n\n    unique case (exc_pc_mux_i)\n      EXC_PC_EXCEPTION:\n      exc_pc = {trap_base_addr, 8'h0};  //1.10 all the exceptions go to base address\n      EXC_PC_IRQ: exc_pc = {trap_base_addr, 1'b0, exc_vec_pc_mux, 2'b0};  // interrupts are vectored\n      EXC_PC_DBD: exc_pc = {dm_halt_addr_i[31:2], 2'b0};\n      EXC_PC_DBE: exc_pc = {dm_exception_addr_i[31:2], 2'b0};\n      default: exc_pc = {trap_base_addr, 8'h0};\n    endcase\n  end\n\n  // fetch address selection\n  always_comb begin\n    // Default assign PC_BOOT (should be overwritten in below case)\n    branch_addr_n = {boot_addr_i[31:2], 2'b0};\n\n    unique case (pc_mux_i)\n      PC_BOOT: branch_addr_n = {boot_addr_i[31:2], 2'b0};\n      PC_JUMP: branch_addr_n = jump_target_id_i;\n      PC_BRANCH: branch_addr_n = jump_target_ex_i;\n      PC_EXCEPTION: branch_addr_n = exc_pc;  // set PC to exception handler\n      PC_MRET: branch_addr_n = mepc_i;  // PC is restored when returning from IRQ/exception\n      PC_URET: branch_addr_n = uepc_i;  // PC is restored when returning from IRQ/exception\n      PC_DRET: branch_addr_n = depc_i;  //\n      PC_FENCEI: branch_addr_n = pc_id_o + 4;  // jump to next instr forces prefetch buffer reload\n      PC_HWLOOP: branch_addr_n = hwlp_target_i;\n      default: ;\n    endcase\n  end\n\n  // tell CS register file to initialize mtvec on boot\n  assign csr_mtvec_init_o = (pc_mux_i == PC_BOOT) & pc_set_i;\n\n  assign fetch_failed    = 1'b0; // PMP is not supported in CV32E40P\n\n  // prefetch buffer, caches a fixed number of instructions\n  cv32e40p_prefetch_buffer #(\n      .PULP_OBI  (PULP_OBI),\n      .COREV_PULP(COREV_PULP)\n  ) prefetch_buffer_i (\n      .clk  (clk),\n      .rst_n(rst_n),\n\n      .req_i(req_i),\n\n      .branch_i     (branch_req),\n      .branch_addr_i({branch_addr_n[31:1], 1'b0}),\n\n      .hwlp_jump_i  (hwlp_jump_i),\n      .hwlp_target_i(hwlp_target_i),\n\n      .fetch_ready_i(fetch_ready),\n      .fetch_valid_o(fetch_valid),\n      .fetch_rdata_o(fetch_rdata),\n\n      // goes to instruction memory / instruction cache\n      .instr_req_o    (instr_req_o),\n      .instr_addr_o   (instr_addr_o),\n      .instr_gnt_i    (instr_gnt_i),\n      .instr_rvalid_i (instr_rvalid_i),\n      .instr_err_i    (instr_err_i),  // Not supported (yet)\n      .instr_err_pmp_i(instr_err_pmp_i),  // Not supported (yet)\n      .instr_rdata_i  (instr_rdata_i),\n\n      // Prefetch Buffer Status\n      .busy_o(prefetch_busy)\n  );\n\n  // offset FSM state transition logic\n  always_comb begin\n\n    fetch_ready = 1'b0;\n    branch_req  = 1'b0;\n    // take care of jumps and branches\n    if (pc_set_i) begin\n      branch_req = 1'b1;\n    end else if (fetch_valid) begin\n      if (req_i && if_valid) begin\n        fetch_ready = aligner_ready;\n      end\n    end\n  end\n\n  assign if_busy_o    = prefetch_busy;\n  assign perf_imiss_o = !fetch_valid && !branch_req;\n\n  // IF-ID pipeline registers, frozen when the ID stage is stalled\n  always_ff @(posedge clk, negedge rst_n) begin : IF_ID_PIPE_REGISTERS\n    if (rst_n == 1'b0) begin\n      instr_valid_id_o    <= 1'b0;\n      instr_rdata_id_o    <= '0;\n      is_fetch_failed_o   <= 1'b0;\n      pc_id_o             <= '0;\n      is_compressed_id_o  <= 1'b0;\n      illegal_c_insn_id_o <= 1'b0;\n    end else begin\n\n      if (if_valid && instr_valid) begin\n        instr_valid_id_o    <= 1'b1;\n        instr_rdata_id_o    <= instr_decompressed;\n        is_compressed_id_o  <= instr_compressed_int;\n        illegal_c_insn_id_o <= illegal_c_insn;\n        is_fetch_failed_o   <= 1'b0;\n        pc_id_o             <= pc_if_o;\n      end else if (clear_instr_valid_i) begin\n        instr_valid_id_o  <= 1'b0;\n        is_fetch_failed_o <= fetch_failed;\n      end\n    end\n  end\n\n  assign if_ready = fetch_valid & id_ready_i;\n  assign if_valid = (~halt_if_i) & if_ready;\n\n  cv32e40p_aligner aligner_i (\n      .clk             (clk),\n      .rst_n           (rst_n),\n      .fetch_valid_i   (fetch_valid),\n      .aligner_ready_o (aligner_ready),\n      .if_valid_i      (if_valid),\n      .fetch_rdata_i   (fetch_rdata),\n      .instr_aligned_o (instr_aligned),\n      .instr_valid_o   (instr_valid),\n      .branch_addr_i   ({branch_addr_n[31:1], 1'b0}),\n      .branch_i        (branch_req),\n      .hwlp_addr_i     (hwlp_target_i),\n      .hwlp_update_pc_i(hwlp_jump_i),\n      .pc_o            (pc_if_o)\n  );\n\n  cv32e40p_compressed_decoder #(\n      .FPU  (FPU),\n      .ZFINX(ZFINX)\n  ) compressed_decoder_i (\n      .instr_i        (instr_aligned),\n      .instr_o        (instr_decompressed),\n      .is_compressed_o(instr_compressed_int),\n      .illegal_instr_o(illegal_c_insn)\n  );\n\n  //----------------------------------------------------------------------------\n  // Assertions\n  //----------------------------------------------------------------------------\n\n`ifdef CV32E40P_ASSERT_ON\n\n  generate\n    if (!COREV_PULP) begin : gen_no_pulp_xpulp_assertions\n\n      // Check that PC Mux cannot select Hardware Loop address iF PULP extensions are not included\n      property p_pc_mux_0;\n        @(posedge clk) disable iff (!rst_n) (1'b1) |-> (pc_mux_i != PC_HWLOOP);\n      endproperty\n\n      a_pc_mux_0 :\n      assert property (p_pc_mux_0);\n\n    end\n  endgenerate\n\n  generate\n    if (!PULP_SECURE) begin : gen_no_pulp_secure_assertions\n\n      // Check that PC Mux cannot select URET address if User Mode is not included\n      property p_pc_mux_1;\n        @(posedge clk) disable iff (!rst_n) (1'b1) |-> (pc_mux_i != PC_URET);\n      endproperty\n\n      a_pc_mux_1 :\n      assert property (p_pc_mux_1);\n\n    end\n  endgenerate\n\n`endif\n\nendmodule\n","lang":"verilog"};
processSrcData(g_data);